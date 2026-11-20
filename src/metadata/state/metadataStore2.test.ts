import { beforeEach, describe, expect, it, vi } from "vitest"

type ItemState = { pin: number | null; legacyId?: string }

const collection = vi.hoisted(() => ({
    items: [] as { id: string; pin: number | null; cState?: ItemState }[],
    waitForReady: vi.fn<() => Promise<void>>(),
    removeItems: vi.fn<(ids: string[]) => Promise<void>>(),
    clear: vi.fn<() => Promise<void>>(),
    addItem: vi.fn(),
    addMedia: vi.fn(),
}))
const mocks = vi.hoisted(() => ({
    getFlag: vi.fn(),
    updateFlag: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    legacyState: { items: [] as unknown[] },
    exists: vi.fn(),
    readFile: vi.fn(),
    persist: vi.fn(),
}))

vi.mock("@/state/mediaStore", () => ({
    default: { defineCollection: () => collection, persist: mocks.persist },
}))
vi.mock("@/state/settings", () => ({
    getSetting: () => false,
    getFlag: mocks.getFlag,
    updateFlag: mocks.updateFlag,
}))
vi.mock("@tauri-apps/api/path", () => import("@/mocks/tauri-path"))
vi.mock("@tauri-apps/plugin-fs", () => ({ exists: mocks.exists, readFile: mocks.readFile }))
vi.mock("@tauri-store/valtio", () => ({
    store: () => ({ state: mocks.legacyState, start: mocks.start, stop: mocks.stop }),
}))

const pixels = new Uint8Array([1, 2, 3])

beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    collection.items = []
    mocks.legacyState.items = []
    mocks.getFlag.mockReturnValue(true)
    mocks.exists.mockResolvedValue(true)
    mocks.readFile.mockResolvedValue(pixels)
    collection.waitForReady.mockResolvedValue(undefined)
    collection.removeItems.mockResolvedValue(undefined)
    collection.clear.mockResolvedValue(undefined)
    function addItem(cState: ItemState) {
        const item = {
            id: `new-${cState.legacyId}`,
            get pin() {
                return cState.pin
            },
            cState,
        }
        collection.items.push(item)
        return item
    }
    collection.addItem.mockImplementation(async (_data, _type, _source, state) => addItem(state))
    collection.addMedia.mockImplementation(async (_media, state) => addItem(state))
})

describe("legacy metadata migration", () => {
    it("runs in the background after readiness and records completion after persisting", async () => {
        const hydration = Promise.withResolvers<void>()
        const legacyLoad = Promise.withResolvers<void>()
        const save = Promise.withResolvers<void>()
        collection.waitForReady.mockReturnValue(hydration.promise)
        mocks.getFlag.mockReturnValue(false)
        mocks.start.mockReturnValue(legacyLoad.promise)
        mocks.persist.mockReturnValue(save.promise)
        const fileSource = { file: "/original/image.jpg", loadedFrom: "drop" }
        const projectSource = { projectFile: "/original/project.sqlite", tensorId: "tensor" }
        const videoSource = { loadedFrom: "open" }
        mocks.legacyState.items = [
            { id: "aaaaaaaaaaaa", type: "jpg", pin: 2, source: fileSource },
            { id: "bbbbbbbbbbbb", type: "png", pin: 1, source: projectSource },
            {
                id: "cccccccccccc",
                type: "mov",
                source: videoSource,
                filePath: "/original/video.mov",
                url: "asset://localhost/video.mov",
            },
        ]

        const { getMetadataStore, useMetadataStore } = await import("./metadataStore2")
        const store = useMetadataStore()
        const ready = getMetadataStore()
        expect(mocks.getFlag).not.toHaveBeenCalled()
        expect(mocks.start).not.toHaveBeenCalled()
        hydration.resolve()
        await expect(ready).resolves.toBe(store)
        expect(mocks.getFlag).toHaveBeenCalledExactlyOnceWith("mediastore_migration")
        expect(mocks.start).toHaveBeenCalledOnce()
        expect(collection.addItem).not.toHaveBeenCalled()

        legacyLoad.resolve()
        await vi.waitFor(() => expect(mocks.persist).toHaveBeenCalledOnce())
        expect(mocks.readFile).toHaveBeenCalledWith("/mock/app-data/dev_images/aaaaaaaaaaaa.jpg")
        expect(collection.addItem).toHaveBeenNthCalledWith(1, pixels, "jpg", fileSource, {
            legacyId: "aaaaaaaaaaaa",
            pin: 2,
        })
        expect(collection.addItem).toHaveBeenNthCalledWith(2, pixels, "png", projectSource, {
            legacyId: "bbbbbbbbbbbb",
            pin: 1,
        })
        expect(collection.addMedia).toHaveBeenCalledExactlyOnceWith(
            { kind: "file", location: "/original/video.mov", type: "mov", source: videoSource },
            { legacyId: "cccccccccccc", pin: null },
        )
        expect(mocks.updateFlag).not.toHaveBeenCalled()
        save.resolve()
        await vi.waitFor(() =>
            expect(mocks.updateFlag).toHaveBeenCalledExactlyOnceWith("mediastore_migration"),
        )
    })

    it("skips the legacy store when the flag is present", async () => {
        const { getMetadataStore } = await import("./metadataStore2")
        await getMetadataStore()
        expect(mocks.getFlag).toHaveBeenCalledExactlyOnceWith("mediastore_migration")
        expect(mocks.start).not.toHaveBeenCalled()
        expect(mocks.updateFlag).not.toHaveBeenCalled()
    })

    it("retries failed imports without adding completed clipboard imports again", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {})
        try {
            mocks.getFlag.mockReturnValue(false)
            mocks.readFile.mockRejectedValueOnce(new Error("Read failed"))
            mocks.legacyState.items = ["aaaaaaaaaaaa", "bbbbbbbbbbbb"].map((id) => ({
                id,
                type: "png",
                source: { loadedFrom: "clipboard" },
            }))
            const first = await import("./metadataStore2")
            await first.getMetadataStore()
            await vi.waitFor(() => expect(log).toHaveBeenCalledOnce())
            expect(mocks.updateFlag).not.toHaveBeenCalled()
            expect(collection.items.map((item) => item.cState?.legacyId)).toEqual(["bbbbbbbbbbbb"])

            vi.resetModules()
            const retry = await import("./metadataStore2")
            await retry.getMetadataStore()
            await vi.waitFor(() => expect(mocks.updateFlag).toHaveBeenCalledOnce())
            expect(collection.items.map((item) => item.cState?.legacyId)).toEqual([
                "bbbbbbbbbbbb",
                "aaaaaaaaaaaa",
            ])
        } finally {
            log.mockRestore()
        }
    })
})

describe("metadata clearing", () => {
    it("waits for hydration before finding unpinned items and awaits their removal", async () => {
        const loading = Promise.withResolvers<void>()
        const cleanup = Promise.withResolvers<void>()
        collection.waitForReady.mockImplementation(async () => {
            await loading.promise
        })
        collection.removeItems.mockImplementation(async () => {
            await cleanup.promise
        })
        const { useMetadataStore } = await import("./metadataStore2")
        const store = useMetadataStore()
        const complete = vi.fn()
        async function clearUnpinned() {
            await store.clearAll(true)
            complete()
        }
        const pending = clearUnpinned()
        expect(collection.removeItems).not.toHaveBeenCalled()
        collection.items = [
            { id: "pinned", pin: 1 },
            { id: "unpinned", pin: null },
        ]
        loading.resolve()
        await vi.waitFor(() =>
            expect(collection.removeItems).toHaveBeenCalledExactlyOnceWith(["unpinned"]),
        )
        expect(complete).not.toHaveBeenCalled()
        cleanup.resolve()
        await pending
        expect(complete).toHaveBeenCalledOnce()
    })

    it.each([true, false])("propagates clearing failures with keepPins=%s", async (keepPins) => {
        const error = new Error("cleanup failed")
        collection.removeItems.mockRejectedValue(error)
        collection.clear.mockRejectedValue(error)
        const { useMetadataStore } = await import("./metadataStore2")
        await expect(useMetadataStore().clearAll(keepPins)).rejects.toBe(error)
    })
})
