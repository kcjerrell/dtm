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
    const store = proxy<MediaStoreType>({ items: [] })
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
        addExistingToCollection: vi
            .fn<MediaStoreApi["addExistingToCollection"]>()
            .mockResolvedValue("item"),
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

describe("async collection mutations", () => {
    it.each(["remove", "clear"] as const)(
        "awaits readiness and completion of %s",
        async (action) => {
            const { store, api, defaults } = setup()
            const loading = Promise.withResolvers<void>()
            const cleanup = Promise.withResolvers<void>()
            api.waitForReady = vi.fn(async () => {
                await loading.promise
            })
            vi.mocked(api[action]).mockImplementation(async () => {
                await cleanup.promise
            })
            const collection = new MediaCollection("pending", defaults, store, api)
            const complete = vi.fn()
            async function mutate() {
                if (action === "remove") await collection.removeItems("item")
                else await collection.clear()
                complete()
            }
            const pending = mutate()
            expect(api[action]).not.toHaveBeenCalled()
            loading.resolve()
            await vi.waitFor(() => expect(api[action]).toHaveBeenCalledOnce())
            expect(complete).not.toHaveBeenCalled()
            cleanup.resolve()
            await pending
            expect(complete).toHaveBeenCalledOnce()
        },
    )

    it.each(["remove", "clear"] as const)("propagates %s failures", async (action) => {
        const { collection, api } = setup()
        const error = new Error("cleanup failed")
        vi.mocked(api[action]).mockRejectedValue(error)
        if (action === "remove") {
            await expect(collection.removeItems("item")).rejects.toBe(error)
        } else {
            await expect(collection.clear()).rejects.toBe(error)
        }
    })

    it("awaits attachment before looking up the mapped item", async () => {
        const { collection, api, store } = setup()
        const attachment = Promise.withResolvers<void>()
        store.items.push({
            id: "shared",
            type: "png",
            source: {},
            url: "shared.png",
            thumbUrl: "shared.png",
            storage: { kind: "app", fname: "shared.png" },
            createdAt: 0,
            $col: { other: {} },
        })
        vi.mocked(api.addExistingToCollection).mockImplementation(
            async (id, collectionId, data) => {
                await attachment.promise
                store.items[0].$col[collectionId] = data
                return id
            },
        )
        const pending = collection.addExisting("shared")
        await vi.waitFor(() => expect(api.addExistingToCollection).toHaveBeenCalledOnce())
        expect(collection.items).toEqual([])
        attachment.resolve()
        const item = await pending
        expect(item?.id).toBe("shared")
        expect(item).toBe(collection.items[0])
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

    it("constructs synchronously and maps hydrated items without awaiting readiness", () => {
        const { store, api } = setup()
        const hydration = Promise.withResolvers<void>()
        api.waitForReady = vi.fn(() => hydration.promise)
        const { defineCollection } = getCollections(store, api)
        const factory = vi.fn(getItemFactory("images", state))
        const collection = defineCollection("images", state, {
            version: 2,
            itemFactory: factory,
        })
        expect(api.waitForReady).not.toHaveBeenCalled()
        expect(factory).not.toHaveBeenCalled()
        expect(collection.items).toEqual([])
        const persistedState = { selected: false, settings: { label: "persisted" } }
        store.items = [storedItem("images", persistedState)]

        expect(factory).toHaveBeenCalledExactlyOnceWith(store.items[0], store.items[0].$col.images)
        expect(collection.items[0].cState).toBe(store.items[0].$col.images)
        expect(collection.items[0].cState).toEqual(persistedState)
        expect(api.waitForReady).not.toHaveBeenCalled()
        expect(Object.keys(store)).toEqual(["items"])
    })

    it("maps existing items immediately when defined after hydration", () => {
        const { store, api } = setup()
        store.items.push(storedItem("images", state))
        const { defineCollection } = getCollections(store, api)
        const collection = defineCollection("images", state)

        expect(collection.items[0].id).toBe("persisted")
        expect(collection.items[0].cState).toBe(store.items[0].$col.images)
    })

    it("rejects collection readiness when store loading fails", async () => {
        const { store, api } = setup()
        const error = new Error("store loading failed")
        api.waitForReady = vi.fn().mockRejectedValue(error)
        const factory = vi.fn(getItemFactory("images", state))
        const { defineCollection } = getCollections(store, api)
        const collection = defineCollection("images", state, { itemFactory: factory })
        expect(api.waitForReady).not.toHaveBeenCalled()

        await expect(collection.waitForReady()).rejects.toBe(error)
        expect(collection.items).toEqual([])
        expect(factory).not.toHaveBeenCalled()
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
