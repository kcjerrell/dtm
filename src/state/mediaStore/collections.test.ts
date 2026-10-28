import { proxy } from "valtio"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { LoadedImage, LoadedMedia } from "@/metadata/state/imageLoaders"
import { getCollections, MediaCollection } from "./collections"
import { getItemFactory, MediaItemBase } from "./MediaItem"
import type {
    MediaItemSource,
    MediaState,
    MediaStateCol,
    MediaStoreApi,
    MediaStoreType,
} from "./types"

const loaders = vi.hoisted(() => ({
    loadImageFromFile: vi.fn<() => Promise<LoadedImage | undefined>>(),
    loadImageFromUrl: vi.fn<() => Promise<LoadedImage | undefined>>(),
    loadImageFromDtp: vi.fn<() => Promise<LoadedImage | undefined>>(),
    loadImageFromPose: vi.fn<() => Promise<LoadedImage | undefined>>(),
    loadImageFromPasteboard: vi.fn<() => Promise<LoadedImage[]>>(),
    loadMediaFromFile: vi.fn<() => Promise<LoadedMedia | undefined>>(),
    loadMediaFromUrl: vi.fn<() => Promise<LoadedMedia | undefined>>(),
    loadMediaFromPasteboard: vi.fn<() => Promise<LoadedMedia[]>>(),
}))
vi.mock("@/metadata/state/imageLoaders", () => loaders)

type ItemState = { selected: boolean; settings: { label: string } }
class Item extends MediaItemBase<ItemState> {
    constructor(
        id: string,
        public label: string,
        state: ItemState,
    ) {
        const media: MediaState = {
            id,
            type: "png",
            url: "",
            thumbUrl: "",
            source: {},
            storage: { kind: "app", fname: `${id}.png` },
            createdAt: 0,
        }
        super(media, state)
    }
}
type Collection = MediaCollection<ItemState, Item>

const buffer = new Uint8Array([1, 2, 3])
const source: MediaItemSource = { loadedFrom: "test" }
const acquired: LoadedImage = {
    buffer,
    type: "png",
    source: { loadedFrom: "loader", file: "/images/acquired.png" },
}
const state: ItemState = { selected: true, settings: { label: "explicit" } }

function setup() {
    const items: Item[] = []
    const store = proxy<MediaStoreType>({ version: { $store: 1 }, items: [] })
    const api: MediaStoreApi = {
        save: vi
            .fn<MediaStoreApi["save"]>()
            .mockImplementation(async (_kind, _data, _type, _source, _collectionId, itemState) => {
                const item = {
                    id: `item-${store.items.length + 1}`,
                    type: _type,
                    source: _source,
                    url: "image.png",
                    thumbUrl: "image.png",
                    storage: { kind: "app" as const, fname: "image.png" },
                    createdAt: 0,
                    $col: { [_collectionId]: itemState },
                }
                store.items.push(item)
                return item.id
            }),
        remove: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
        waitForReady: vi.fn<MediaStoreApi["waitForReady"]>().mockResolvedValue(undefined),
        addExistingToCollection: vi.fn(),
    }
    const defaults: ItemState = { selected: false, settings: { label: "default" } }
    const collection = new MediaCollection<ItemState, Item>("test", defaults, store, api, {
        itemFactory: (media, state) => {
            const item = proxy(new Item(media.id, "collection facade", state))
            items.push(item)
            return item
        },
    })
    const addItem = vi.spyOn(collection, "addItem")
    return { collection, addItem, api, items, defaults, store }
}

const singleImageCases = [
    {
        name: "file",
        loader: loaders.loadImageFromFile,
        args: ["/images/cat.png", source],
        add: (collection: Collection, state?: ItemState) =>
            collection.addImageFromFile("/images/cat.png", source, state),
    },
    {
        name: "URL",
        loader: loaders.loadImageFromUrl,
        args: ["https://example.test/cat.png", source],
        add: (collection: Collection, state?: ItemState) =>
            collection.addImageFromUrl("https://example.test/cat.png", source, state),
    },
    {
        name: "Draw Things project",
        loader: loaders.loadImageFromDtp,
        args: [7, 11],
        add: (collection: Collection, state?: ItemState) =>
            collection.addImageFromDtp(7, 11, state),
    },
    {
        name: "pose",
        loader: loaders.loadImageFromPose,
        args: ['{"people":[],"width":512,"height":512}', source],
        add: (collection: Collection, state?: ItemState) =>
            collection.addImageFromPose('{"people":[],"width":512,"height":512}', source, state),
    },
]

beforeEach(() => {
    vi.resetAllMocks()
    loaders.loadImageFromPasteboard.mockResolvedValue([])
    loaders.loadMediaFromPasteboard.mockResolvedValue([])
})

describe("collection options", () => {
    it("creates a synchronous collection with a default factory and runtime lookup", async () => {
        const { store, api } = setup()
        const registry = getCollections(store, api)
        const collection = registry.defineCollection("default", { selected: false })
        expect(registry.getCollection("default")).toBe(collection)
        expect(registry.useCollection("default")).toBe(collection)
        expect(registry.getCollection("missing")).toBeNull()
        expect(() => registry.defineCollection("default", {})).toThrow("already registered")
        store.items.push({
            id: "default-item",
            type: "png",
            url: "",
            thumbUrl: "",
            source: {},
            storage: { kind: "app", fname: "default.png" },
            createdAt: 0,
            $col: { default: { selected: true } },
        })
        await collection.waitForReady()
        expect(collection.items[0]).toBeInstanceOf(MediaItemBase)
        expect(collection.items[0].selected).toBe(true)
    })

    it("keeps custom factories and callbacks within the collection", async () => {
        const { store, api } = setup()
        const { defineCollection } = getCollections(store, api)
        const itemFactory = vi.fn(
            (media: MediaState, state: ItemState) => new Item(media.id, "custom", state),
        )
        const onItemsChanged = vi.fn()
        const collection = defineCollection("custom", state, { itemFactory, onItemsChanged })
        await collection.waitForReady()
        const item = await collection.addItem(buffer, "png", source)
        expect(item?.label).toBe("custom")
        expect(itemFactory).toHaveBeenCalledOnce()
        await vi.waitFor(() => expect(onItemsChanged).toHaveBeenCalledOnce())
    })
})

describe("collection initialization", () => {
    function storedItem(collectionId: string, itemState: Record<string, unknown>): MediaStateCol {
        return {
            id: "persisted",
            type: "png",
            url: "image.png",
            thumbUrl: "image.png",
            source: {},
            storage: { kind: "app", fname: "persisted.png" },
            createdAt: 1,
            $col: { [collectionId]: itemState },
        }
    }

    it("migrates hydrated items before syncing and running postMigrate", async () => {
        const { store, api } = setup()
        const hydration = Promise.withResolvers<void>()
        api.waitForReady = vi.fn(() => hydration.promise)
        const events: string[] = []
        const { defineCollection } = getCollections(store, api)
        const onMigrate = vi.fn(
            (_from: number | undefined, _to: number, items: { state: unknown }[]) => {
                events.push("migrate")
                return items.map(() => state)
            },
        )
        const postMigrate = vi.fn(
            (_from: number | undefined, _to: number, collection: MediaCollection<ItemState>) => {
                events.push("post")
                expect(collection.items[0].cState).toEqual(state)
            },
        )
        const collection = defineCollection("images", state, {
            version: 2,
            onMigrate,
            postMigrate,
            itemFactory: (media, state) => {
                events.push("map")
                return getItemFactory("images", state)(media, state)
            },
        })
        store.items.push(storedItem("images", { old: true }))
        store.version.images = 1

        expect(onMigrate).not.toHaveBeenCalled()
        expect(collection.isReady).toBe(false)
        expect(collection.items).toEqual([])
        expect(events).toEqual([])
        hydration.resolve()
        await collection.waitForReady()
        await vi.waitFor(() => expect(postMigrate).toHaveBeenCalledOnce())

        expect(onMigrate).toHaveBeenCalledWith(1, 2, [
            { media: store.items[0], state: { old: true } },
        ])
        expect(events).toEqual(["migrate", "map", "post"])
        expect(store.version.images).toBe(2)
    })

    it("migrates a collection defined after hydration", async () => {
        const { store, api } = setup()
        store.version.images = 1
        store.items.push(storedItem("images", { old: true }))
        const onMigrate = vi.fn(() => [{ selected: true, settings: { label: "new" } }])
        const { defineCollection } = getCollections(store, api)
        const collection = defineCollection("images", state, { version: 2, onMigrate })

        await collection.waitForReady()
        expect(onMigrate).toHaveBeenCalledOnce()
        expect(store.items[0].$col.images).toEqual({ selected: true, settings: { label: "new" } })
        expect(collection.isReady).toBe(true)
        expect(collection.items[0].cState).toBe(store.items[0].$col.images)
        expect(store.version.images).toBe(2)
    })

    it("reports postMigrate failures without invalidating the completed migration", async () => {
        const { store, api } = setup()
        const error = new Error("post-migration failed")
        const log = vi.spyOn(console, "error").mockImplementation(() => {})
        try {
            const { defineCollection } = getCollections(store, api)
            const collection = defineCollection("images", state, {
                version: 2,
                postMigrate: async () => {
                    throw error
                },
            })
            await expect(collection.waitForReady()).resolves.toBeUndefined()
            await vi.waitFor(() =>
                expect(log).toHaveBeenCalledWith("images post-migration failed:", error),
            )
            expect(store.version.images).toBe(2)
        } finally {
            log.mockRestore()
        }
    })

    it("rejects collection readiness on migration failure without blocking another collection", async () => {
        const { store, api } = setup()
        const { defineCollection } = getCollections(store, api)
        const error = new Error("migration failed")
        const failed = defineCollection("failed", state, {
            version: 2,
            onMigrate: () => {
                throw error
            },
        })
        const healthy = defineCollection("healthy", state)

        await expect(failed.waitForReady()).rejects.toBe(error)
        await expect(healthy.waitForReady()).resolves.toBeUndefined()
        expect(failed.isReady).toBe(false)
        expect(healthy.isReady).toBe(true)
        expect(store.version.failed).toBeUndefined()
    })
})

describe("referenced video collection items", () => {
    it.each([
        ["file", "/videos/movie.mov", "mov"],
        ["url", "https://example.test/movie.mp4", "mp4"],
    ] as const)("saves %s without caching bytes", async (kind, location, type) => {
        const { collection, api, items } = setup()
        const video: LoadedMedia = { kind, location, type, source }
        const result = await collection.addMedia(video, state)
        expect(api.save).toHaveBeenCalledExactlyOnceWith(
            kind,
            location,
            type,
            source,
            "test",
            state,
        )
        expect(result).toBe(items[0])
    })

    it("adds mixed pasteboard media through their respective storage kinds", async () => {
        const { collection, api } = setup()
        loaders.loadMediaFromPasteboard.mockResolvedValue([
            acquired,
            { kind: "file", location: "/videos/movie.mp4", type: "mp4", source },
        ])
        expect(await collection.addMediaFromPasteboard("drag")).toHaveLength(2)
        expect(api.save).toHaveBeenNthCalledWith(
            1,
            "app",
            buffer,
            "png",
            acquired.source,
            "test",
            expect.any(Object),
        )
        expect(api.save).toHaveBeenNthCalledWith(
            2,
            "file",
            "/videos/movie.mp4",
            "mp4",
            source,
            "test",
            expect.any(Object),
        )
    })
})

describe("default item factory", () => {
    it("returns a MediaItemBase facade backed by the collection state", () => {
        const state: ItemState = { selected: false, settings: { label: "default" } }
        const media: MediaState = {
            id: "item-1",
            type: "png",
            url: "image.png",
            thumbUrl: "thumb.png",
            source: {},
            storage: { kind: "app", fname: "item-1.png" },
            createdAt: 1,
        }

        const item = getItemFactory("test", state)(media, state)

        expect(item).toBeInstanceOf(MediaItemBase)
        expect(item.id).toBe("item-1")
        expect(item.selected).toBe(false)
        item.selected = true
        expect(state.selected).toBe(true)
    })
})

describe.each(singleImageCases)(
    "MediaCollection acquisition from $name",
    ({ loader, args, add }) => {
        it("delegates acquisition, forwards the loaded source and state, and returns the collection item", async () => {
            const { collection, addItem, api, items } = setup()
            loader.mockResolvedValue(acquired)
            const result = await add(collection, state)
            expect(loader).toHaveBeenCalledExactlyOnceWith(...args)
            expect(addItem).toHaveBeenCalledExactlyOnceWith(buffer, "png", acquired.source, state)
            expect(addItem.mock.calls[0][3]).toBe(state)
            expect(api.save).toHaveBeenCalledExactlyOnceWith(
                "app",
                buffer,
                "png",
                acquired.source,
                "test",
                state,
            )
            expect(result).toBe(items[0])
            expect(result?.id).toBe("item-1")
            expect(result?.label).toBe("collection facade")
        })

        it("does not add or save anything when acquisition returns undefined", async () => {
            const { collection, addItem, api } = setup()
            loader.mockResolvedValue(undefined)
            expect(await add(collection, state)).toBeUndefined()
            expect(loader).toHaveBeenCalledExactlyOnceWith(...args)
            expect(addItem).not.toHaveBeenCalled()
            expect(api.save).not.toHaveBeenCalled()
        })

        it("defaults a missing loaded source to an empty object", async () => {
            const { collection, addItem } = setup()
            loader.mockResolvedValue({ buffer, type: "png" })
            await add(collection, state)
            expect(addItem).toHaveBeenCalledExactlyOnceWith(buffer, "png", {}, state)
        })

        it("returns undefined when addItem cannot resolve the saved collection item", async () => {
            const { collection, addItem } = setup()
            loader.mockResolvedValue(acquired)
            addItem.mockResolvedValue(undefined)
            expect(await add(collection, state)).toBeUndefined()
            expect(addItem).toHaveBeenCalledExactlyOnceWith(buffer, "png", acquired.source, state)
        })
    },
)

describe("MediaCollection pasteboard acquisition", () => {
    it.each(["general", "drag"] as const)(
        "adds all %s images in order, forwards state, and returns collection items",
        async (pasteboard) => {
            const { collection, addItem, items } = setup()
            const second: LoadedImage = { buffer: new Uint8Array([4, 5, 6]), type: "jpg" }
            loaders.loadImageFromPasteboard.mockResolvedValue([acquired, second])
            const result = await collection.addImageFromPasteboard(pasteboard, state)
            expect(loaders.loadImageFromPasteboard).toHaveBeenCalledExactlyOnceWith(pasteboard)
            expect(addItem).toHaveBeenCalledTimes(2)
            expect(addItem).toHaveBeenNthCalledWith(1, buffer, "png", acquired.source, state)
            expect(addItem).toHaveBeenNthCalledWith(2, second.buffer, "jpg", {}, state)
            expect(result).toEqual(items)
            expect(result[0]).toBe(items[0])
            expect(result[1]).toBe(items[1])
        },
    )

    it("returns an empty array without adding anything for an empty acquisition", async () => {
        const { collection, addItem, api } = setup()
        expect(await collection.addImageFromPasteboard("general", state)).toEqual([])
        expect(loaders.loadImageFromPasteboard).toHaveBeenCalledExactlyOnceWith("general")
        expect(addItem).not.toHaveBeenCalled()
        expect(api.save).not.toHaveBeenCalled()
    })

    it("omits unresolved collection items from the returned array", async () => {
        const { collection, addItem } = setup()
        const item = new Item("resolved", "collection facade", state)
        loaders.loadImageFromPasteboard.mockResolvedValue([acquired, acquired])
        addItem.mockResolvedValueOnce(undefined).mockResolvedValueOnce(item)
        expect(await collection.addImageFromPasteboard("general", state)).toEqual([item])
        expect(addItem).toHaveBeenCalledTimes(2)
    })

    it("leaves omitted state to addItem so each image gets independent collection defaults", async () => {
        const { collection, addItem, api, defaults } = setup()
        loaders.loadImageFromPasteboard.mockResolvedValue([acquired, acquired])
        await collection.addImageFromPasteboard("general")
        expect(addItem).toHaveBeenNthCalledWith(1, buffer, "png", acquired.source, undefined)
        expect(addItem).toHaveBeenNthCalledWith(2, buffer, "png", acquired.source, undefined)
        const [first, second] = vi.mocked(api.save).mock.calls.map((call) => call[5] as ItemState)
        expect(first).toEqual(defaults)
        expect(second).toEqual(defaults)
        expect(first).not.toBe(defaults)
        expect(first).not.toBe(second)
        expect(first.settings).not.toBe(second.settings)
    })
})
