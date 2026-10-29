import { proxy } from "valtio"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MediaItemBase } from "./MediaItem"
import type { MediaState, MediaStateCol, MediaStoreApi, MediaStoreType } from "./types"

const fixtures = vi.hoisted(() => ({
    items: [] as MediaStateCol[],
    state: undefined as MediaStoreType | undefined,
    api: undefined as MediaStoreApi | undefined,
    onExit: vi.fn<(callback: () => Promise<void>) => void>(),
    start: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    removeFile: vi.fn<(fname: string) => Promise<void>>().mockResolvedValue(undefined),
    copyToClipboard: vi.fn<(fname: string) => Promise<void>>().mockResolvedValue(undefined),
    saveCopy: vi.fn<(fname: string, dest: string) => Promise<void>>().mockResolvedValue(undefined),
    saveFile:
        vi.fn<
            (id: string, data: Uint8Array, type: string) => Promise<{ fname: string; url: string }>
        >(),
    removeOrphanedFiles: vi
        .fn<(files: ReadonlySet<string>) => Promise<void>>()
        .mockResolvedValue(undefined),
}))

vi.mock("@/lifecycle", () => ({ default: { onExit: fixtures.onExit } }))
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => `asset://${path}` }))
vi.mock("./files", () => ({ MediaStoreFiles: fixtures }))
vi.mock("./collections", async (importOriginal) => {
    const original = await importOriginal<typeof import("./collections")>()
    return {
        ...original,
        getCollections: (store: MediaStoreType, api: MediaStoreApi) => {
            fixtures.api = api
            return original.getCollections(store, api)
        },
    }
})
vi.mock("@tauri-store/valtio", () => ({
    store: (_name: string, initial: MediaStoreType) => {
        const state = proxy({ ...initial, items: structuredClone(fixtures.items) })
        fixtures.state = state
        return { state, start: () => fixtures.start() }
    },
}))

function item(id: string, collections: string[]): MediaStateCol {
    return {
        id,
        type: "png",
        url: "",
        thumbUrl: "",
        source: {},
        storage: { kind: "app", fname: `${id}.png` },
        createdAt: 0,
        $col: Object.fromEntries(collections.map((id) => [id, {}])),
    }
}

class ExitItem extends MediaItemBase<{ clear: boolean }> {
    get clearOnExit() {
        return this.cState.clear === true
    }
}

const exitOptions = {
    itemFactory: (media: MediaState, state: { clear: boolean }) => new ExitItem(media, state),
}

beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    fixtures.items = []
    fixtures.state = undefined
    fixtures.api = undefined
    fixtures.start.mockResolvedValue(undefined)
    fixtures.removeFile.mockResolvedValue(undefined)
    fixtures.removeOrphanedFiles.mockResolvedValue(undefined)
    fixtures.saveFile.mockImplementation(async (id, _data, type) => ({
        fname: `${id}.${type}`,
        url: `asset://${id}.${type}`,
    }))
})

describe("media-store hydration", () => {
    it.each(["save", "remove", "clear", "attach"] as const)(
        "waits for hydration before the internal %s action",
        async (action) => {
            const loading = Promise.withResolvers<void>()
            fixtures.start.mockImplementation(async () => {
                await loading.promise
                fixtures.state?.items.push(item("restored", ["a"]))
            })
            const { default: mediaStore } = await import("./index")
            mediaStore.defineCollection("a", {})
            mediaStore.defineCollection("b", {})
            const api = fixtures.api
            if (!api) throw new Error("expected the internal store API")
            const actions = {
                save: async () => {
                    await api.save("app", new Uint8Array([1]), "png", {}, "a", {})
                },
                remove: async () => {
                    await api.remove(["restored"], "a")
                },
                clear: async () => {
                    await api.clear("a")
                },
                attach: async () => {
                    await api.addExistingToCollection("restored", "b", {})
                },
            }
            const pending = actions[action]()
            expect(fixtures.state?.items).toEqual([])
            expect(fixtures.saveFile).not.toHaveBeenCalled()
            expect(fixtures.removeFile).not.toHaveBeenCalled()
            loading.resolve()
            await pending

            if (action === "save") {
                expect(fixtures.state?.items).toHaveLength(2)
                expect(fixtures.saveFile).toHaveBeenCalledOnce()
            } else if (action === "attach") {
                expect(fixtures.state?.items[0].$col).toEqual({ a: {}, b: {} })
            } else {
                expect(fixtures.state?.items).toEqual([])
                expect(fixtures.removeFile).toHaveBeenCalledExactlyOnceWith("restored.png")
            }
        },
    )

    it.each(["copyImageToClipboard", "saveCopy"] as const)(
        "waits for hydration before %s reads an item",
        async (action) => {
            const loading = Promise.withResolvers<void>()
            fixtures.start.mockImplementation(async () => {
                await loading.promise
                fixtures.state?.items.push(item("restored", ["a"]))
            })
            const { default: mediaStore } = await import("./index")
            const pending =
                action === "saveCopy"
                    ? mediaStore.saveCopy("restored", "/export.png")
                    : mediaStore.copyImageToClipboard("restored")
            expect(fixtures.copyToClipboard).not.toHaveBeenCalled()
            expect(fixtures.saveCopy).not.toHaveBeenCalled()
            loading.resolve()
            await pending

            if (action === "saveCopy") {
                expect(fixtures.saveCopy).toHaveBeenCalledExactlyOnceWith(
                    "restored.png",
                    "/export.png",
                )
            } else {
                expect(fixtures.copyToClipboard).toHaveBeenCalledExactlyOnceWith("restored.png")
            }
        },
    )

    it("maps persisted items only after start restores them", async () => {
        const loading = Promise.withResolvers<void>()
        fixtures.start.mockImplementation(async () => {
            await loading.promise
            fixtures.state?.items.push(item("restored", ["images"]))
        })
        const { default: mediaStore } = await import("./index")
        const factory = vi.fn(
            (media: MediaState, state: Record<string, unknown>) => new MediaItemBase(media, state),
        )
        const collection = mediaStore.defineCollection("images", {}, { itemFactory: factory })
        expect(factory).not.toHaveBeenCalled()
        expect(collection.items).toEqual([])
        loading.resolve()

        await collection.waitForReady()
        expect(factory).toHaveBeenCalledExactlyOnceWith(fixtures.state?.items[0], {})
        expect(collection.items[0].id).toBe("restored")
    })
})

describe("media-store exit cleanup", () => {
    it("retains loaded collection items by default", async () => {
        fixtures.items = [item("retained", ["a"])]
        const { default: mediaStore } = await import("./index")
        const collection = mediaStore.defineCollection("a", {})
        await collection.waitForReady()

        await fixtures.onExit.mock.calls[0][0]()

        expect(fixtures.state?.items).toHaveLength(1)
        expect(fixtures.state?.items[0].$col).toEqual({ a: {} })
        expect(fixtures.removeFile).not.toHaveBeenCalled()
    })

    it("sweeps orphans on exit after cleanup and retains unloaded collections", async () => {
        fixtures.items = [item("only-b", ["b"])]
        const { default: mediaStore } = await import("./index")
        await mediaStore.waitForReady()

        expect(fixtures.removeOrphanedFiles).not.toHaveBeenCalled()
        await fixtures.onExit.mock.calls[0][0]()
        expect(fixtures.removeOrphanedFiles).toHaveBeenCalledExactlyOnceWith(
            new Set(["only-b.png"]),
        )
    })

    it("waits for item removal before sweeping orphaned files", async () => {
        fixtures.items = [item("only-a", ["a"])]
        const removal = Promise.withResolvers<void>()
        fixtures.removeFile.mockImplementation(async () => removal.promise)
        const { default: mediaStore } = await import("./index")
        const collection = mediaStore.defineCollection("a", { clear: false }, exitOptions)
        await collection.waitForReady()
        collection.items[0].cState.clear = true

        const exiting = fixtures.onExit.mock.calls[0][0]()
        await vi.waitFor(() => expect(fixtures.removeFile).toHaveBeenCalledOnce())
        expect(fixtures.removeOrphanedFiles).not.toHaveBeenCalled()
        removal.resolve()
        await exiting
        expect(fixtures.removeOrphanedFiles).toHaveBeenCalledExactlyOnceWith(new Set())
    })

    it("retains store items and files when a mapped-item factory fails", async () => {
        const { default: mediaStore } = await import("./index")
        const collection = mediaStore.defineCollection(
            "broken",
            {},
            {
                itemFactory: () => {
                    throw new Error("factory failed")
                },
            },
        )
        await collection.waitForReady()

        const log = vi.spyOn(console, "error").mockImplementation(() => {})
        try {
            await expect(
                collection.addItem(new Uint8Array([1]), "png", {}),
            ).resolves.toBeUndefined()
            expect(fixtures.state?.items).toHaveLength(1)
            expect(fixtures.state?.items[0].$col).toEqual({ broken: {} })
            expect(collection.items).toEqual([])
            expect(fixtures.removeFile).not.toHaveBeenCalled()
            const storedItem = fixtures.state?.items[0]
            if (!storedItem) throw new Error("expected persisted store item")
            await expect(collection.addExisting(storedItem.id)).rejects.toThrow(
                "already in collection",
            )
        } finally {
            log.mockRestore()
        }
    })

    it("shares raw items between independent collection views and retains a failed attachment", async () => {
        const { default: mediaStore } = await import("./index")
        const a = mediaStore.defineCollection("a", { clear: false })
        const b = mediaStore.defineCollection("b", { clear: false })
        const broken = mediaStore.defineCollection(
            "broken",
            {},
            {
                itemFactory: () => {
                    throw new Error("broken attachment view")
                },
            },
        )
        await Promise.all([a.waitForReady(), b.waitForReady(), broken.waitForReady()])
        const first = await a.addItem(new Uint8Array([1]), "png", {})
        if (!first) throw new Error("expected source view")
        const second = await b.addExisting(first.id)
        expect(second).not.toBe(first)
        expect(second?.id).toBe(first.id)
        expect(fixtures.state?.items).toHaveLength(1)
        expect(fixtures.saveFile).toHaveBeenCalledOnce()
        const log = vi.spyOn(console, "error").mockImplementation(() => {})
        try {
            await expect(broken.addExisting(first.id)).resolves.toBeUndefined()
            expect(fixtures.state?.items[0].$col).toEqual({
                a: { clear: false },
                b: { clear: false },
                broken: {},
            })
            await a.removeItems(first.id)
            expect(a.items).toEqual([])
            expect(b.items[0]).toBe(second)
            expect(fixtures.removeFile).not.toHaveBeenCalled()
            await b.clear()
            expect(fixtures.state?.items).toHaveLength(1)
            expect(fixtures.state?.items[0].$col).toEqual({ broken: {} })
            await broken.clear()
            await mediaStore.reset()
            expect(fixtures.state?.items).toEqual([])
            expect(fixtures.removeFile).toHaveBeenCalledOnce()
        } finally {
            log.mockRestore()
        }
    })

    it("runs all exit callbacks before inspecting any mapped-item flags", async () => {
        fixtures.items = [item("only-a", ["a"])]
        const { default: mediaStore } = await import("./index")
        const a = mediaStore.defineCollection("a", { clear: false }, exitOptions)
        const b = mediaStore.defineCollection(
            "b",
            {},
            {
                onExit: () => {
                    a.items[0].cState.clear = true
                },
            },
        )
        await Promise.all([a.waitForReady(), b.waitForReady()])
        await fixtures.onExit.mock.calls[0][0]()
        expect(fixtures.state?.items).toEqual([])
        expect(fixtures.removeFile).toHaveBeenCalledExactlyOnceWith("only-a.png")
    })

    it("awaits cleanup already started by a public removal before sweeping files", async () => {
        fixtures.items = [item("only-a", ["a"])]
        const { default: mediaStore } = await import("./index")
        const a = mediaStore.defineCollection("a", {})
        await a.waitForReady()
        const removal = Promise.withResolvers<void>()
        fixtures.removeFile.mockImplementation(() => removal.promise)
        const removing = a.removeItems("only-a")
        await vi.waitFor(() => expect(a.items).toEqual([]))
        const exiting = fixtures.onExit.mock.calls[0][0]()
        await vi.waitFor(() => expect(fixtures.removeFile).toHaveBeenCalledOnce())
        expect(fixtures.removeOrphanedFiles).not.toHaveBeenCalled()
        removal.resolve()
        await removing
        await exiting
        expect(fixtures.removeOrphanedFiles).toHaveBeenCalledExactlyOnceWith(new Set())
    })

    it("keeps items for collections that were never defined", async () => {
        fixtures.items = [item("only-a", ["a"]), item("only-b", ["b"])]
        const { default: mediaStore } = await import("./index")
        const collection = mediaStore.defineCollection("a", { clear: false }, exitOptions)
        await collection.waitForReady()
        collection.items[0].cState.clear = true

        await fixtures.onExit.mock.calls[0][0]()

        expect(fixtures.state?.items.map((it) => it.id)).toEqual(["only-b"])
        expect(fixtures.state?.items[0].$col).toEqual({ b: {} })
        expect(fixtures.removeFile).toHaveBeenCalledExactlyOnceWith("only-a.png")
        expect(fixtures.removeOrphanedFiles).toHaveBeenCalledExactlyOnceWith(
            new Set(["only-b.png"]),
        )
    })

    it("removes only the rejecting collection's data from shared items", async () => {
        fixtures.items = [item("shared", ["a", "b"]), item("only-b", ["b"])]
        const { default: mediaStore } = await import("./index")
        const a = mediaStore.defineCollection("a", { clear: false }, exitOptions)
        const b = mediaStore.defineCollection("b", { clear: false }, exitOptions)
        await Promise.all([a.waitForReady(), b.waitForReady()])
        for (const collectionItem of b.items) collectionItem.cState.clear = true

        await fixtures.onExit.mock.calls[0][0]()

        expect(fixtures.state?.items.map((it) => it.id)).toEqual(["shared"])
        expect(fixtures.state?.items[0].$col).toEqual({ a: {} })
        expect(fixtures.removeFile).toHaveBeenCalledExactlyOnceWith("only-b.png")
        expect(fixtures.removeOrphanedFiles).toHaveBeenCalledExactlyOnceWith(
            new Set(["shared.png"]),
        )
    })

    it("does not remove a shared file if an unloaded collection still owns it", async () => {
        fixtures.items = [item("shared", ["a", "b"])]
        const { default: mediaStore } = await import("./index")
        const collection = mediaStore.defineCollection("a", { clear: false }, exitOptions)
        await collection.waitForReady()
        collection.items[0].cState.clear = true

        await fixtures.onExit.mock.calls[0][0]()

        expect(fixtures.state?.items[0].$col).toEqual({ b: {} })
        expect(fixtures.removeFile).not.toHaveBeenCalled()
        expect(fixtures.removeOrphanedFiles).toHaveBeenCalledExactlyOnceWith(
            new Set(["shared.png"]),
        )
    })
})
