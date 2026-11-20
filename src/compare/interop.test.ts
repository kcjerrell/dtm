import { proxy } from "valtio"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MediaStoreFiles } from "@/state/mediaStore/files"
import type { MediaStateCol, MediaStoreType } from "@/state/mediaStore/types"

const mocks = vi.hoisted(() => ({
    sidebarActivity: { compare: false },
    toast: vi.fn(),
    withSnapshot: vi.fn<typeof MediaStoreFiles.withSnapshot>(),
    decode: vi.fn(),
    items: [] as MediaStateCol[],
    updateSetting: vi.fn(),
}))

vi.mock("@/components/ui/toaster", () => ({ toaster: { create: mocks.toast } }))
vi.mock("@/hooks/appState", () => ({
    default: { store: { sidebarActivity: mocks.sidebarActivity } },
}))
vi.mock("@/lifecycle", () => ({ default: { onExit: vi.fn() } }))
vi.mock("@/state/settings", () => ({
    getFlag: () => true,
    getSetting: vi.fn(),
    updateSetting: mocks.updateSetting,
}))
vi.mock("@/state/mediaStore/files", () => ({
    MediaStoreFiles: { withSnapshot: mocks.withSnapshot, removeSnapshot: vi.fn() },
}))
vi.mock("@tauri-store/valtio", () => ({
    store: (_name: string, state: MediaStoreType) => ({
        state: proxy({ ...state, items: structuredClone(mocks.items) }),
        start: async () => {},
    }),
}))

const data = new Uint8Array([1])
const source = { source: "project", projectId: 1, projectFile: "one.sqlite", tensorId: "tensor1" }
const video: MediaStateCol = {
    id: "metadata-video",
    type: "mp4",
    url: "asset://clip.mp4",
    thumbUrl: "asset://clip.mp4",
    source: { file: "/videos/clip.mp4" },
    storage: { kind: "app", fname: "clip.mp4" },
    createdAt: 0,
    $col: { metadata: { pin: 1 } },
}

beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    mocks.items = []
    mocks.sidebarActivity.compare = false
    mocks.withSnapshot.mockImplementation(async (id, _input, type, use) =>
        use(
            {
                fname: `${id}.${type}`,
                url: `asset://${id}.${type}`,
                createThumbnail: async () => `asset://${id}t.png`,
            },
            () => {},
        ),
    )
    mocks.decode.mockResolvedValue(undefined)
    vi.stubGlobal(
        "Image",
        class {
            decode = mocks.decode
        },
    )
})

afterEach(() => vi.unstubAllGlobals())

describe("sending images to Compare", () => {
    it("rejects importing new videos and attaching existing Metadata videos", async () => {
        mocks.items = [video]
        const { addMediaItem } = await import("./interop")
        const { getCompareStore } = await import("./state")
        const { getMetadataStore } = await import("@/metadata/state/metadataStore2")
        const { collection, state } = await getCompareStore()

        await expect(
            collection.importMedia({ kind: "file", location: "/videos/other.mov", type: "mov" }),
        ).rejects.toThrow("Videos are not allowed in this collection")
        await addMediaItem(video.id)

        expect((await getMetadataStore()).state.items[0]?.isVideo).toBe(true)
        expect(state.items).toHaveLength(0)
        expect(mocks.withSnapshot).not.toHaveBeenCalled()
        expect(mocks.decode).not.toHaveBeenCalled()
        expect(mocks.sidebarActivity.compare).toBe(false)
        expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
            title: "Could not add image to Compare",
            type: "error",
            description: "Videos are not allowed in this collection",
        })
    })

    it("hides a previously added video while accepting a still from the same project source", async () => {
        mocks.items = [{ ...video, source, $col: { ...video.$col, icompare: { pin: 1 } } }]
        const { addNewItem } = await import("./interop")
        const { getCompareStore } = await import("./state")
        const { getMetadataStore } = await import("@/metadata/state/metadataStore2")
        const { state: compare } = await getCompareStore()

        expect(compare.items).toHaveLength(0)
        await addNewItem(data, "png", source)

        expect(compare.items.map(({ type }) => type)).toEqual(["png"])
        expect(compare.imageA).toBe(compare.items[0])
        expect((await getMetadataStore()).state.items.map(({ id, pin }) => ({ id, pin }))).toEqual([
            { id: video.id, pin: 1 },
        ])
    })

    it.each(["Compare", "Metadata"])(
        "shares the same project image when sent to %s first",
        async (firstView) => {
            const { addMediaItem, addNewItem } = await import("./interop")
            const { getCompareStore } = await import("./state")
            const { sendToMetadata } = await import("@/metadata/state/interop")
            const { getMetadataStore } = await import("@/metadata/state/metadataStore2")
            if (firstView === "Compare") {
                await addNewItem(data, "png", source)
                await sendToMetadata(data, "png", { ...source, projectFile: "/test/one.sqlite" })
            } else {
                await sendToMetadata(data, "png", source)
                await addNewItem(data, "png", source)
            }

            const { state: compare } = await getCompareStore()
            const { state: metadata } = await getMetadataStore()
            expect(mocks.withSnapshot).toHaveBeenCalledOnce()
            expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
                title: "Image added to Compare",
                type: "success",
            })
            expect(metadata.currentItem?.id).toBe(compare.items[0].id)
            expect(mocks.updateSetting).toHaveBeenCalledWith("app.currentView", "metadata")

            await sendToMetadata(data, "png", source)
            expect(metadata.items).toEqual([metadata.currentItem])
            expect(mocks.toast).toHaveBeenLastCalledWith({
                title: "Image already in Metadata",
                type: "info",
            })

            if (!metadata.currentItem) throw new Error("expected a selected Metadata item")
            await addMediaItem(metadata.currentItem.id)
            expect(compare.items).toHaveLength(1)
            expect(compare.imageB).toBeUndefined()
            expect(mocks.toast).toHaveBeenLastCalledWith({
                title: "Image already in Compare",
                type: "info",
            })
        },
    )

    it("blocks a Metadata send when older imports assigned the same project image different IDs", async () => {
        mocks.items = [
            ["metadata-copy", "metadata"],
            ["compare-copy", "icompare"],
        ].map(([id, collectionId]) => ({
            id,
            type: "png",
            url: `asset://${id}.png`,
            thumbUrl: `asset://${id}.png`,
            source,
            storage: { kind: "app", fname: `${id}.png` },
            createdAt: 0,
            $col: { [collectionId]: { pin: null } },
        }))
        const { addMediaItem } = await import("./interop")
        const { getCompareStore } = await import("./state")

        await addMediaItem("metadata-copy")

        const { state } = await getCompareStore()
        expect(state.items.map(({ id }) => id)).toEqual(["compare-copy"])
        expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
            title: "Image already in Compare",
            type: "info",
        })
    })

    it("adds a project tensor only once when two sends overlap", async () => {
        const { addNewItem } = await import("./interop")
        const { getCompareStore } = await import("./state")

        await Promise.all([
            addNewItem(data, "png", source),
            addNewItem(data, "png", { ...source, nodeId: 2 }),
        ])

        const { state } = await getCompareStore()
        expect(mocks.withSnapshot).toHaveBeenCalledOnce()
        expect(state.items).toHaveLength(1)
        expect(state.imageA).toBe(state.items[0])
        expect(state.imageB).toBeUndefined()
        expect(mocks.sidebarActivity.compare).toBe(true)
        expect(mocks.toast.mock.calls.map(([toast]) => toast)).toEqual(
            expect.arrayContaining([
                { title: "Image added to Compare", type: "success" },
                { title: "Image already in Compare", type: "info" },
            ]),
        )
        expect(mocks.toast).toHaveBeenCalledTimes(2)
    })

    it("adds separate projects, tensors, and resources without tensor IDs", async () => {
        const { addNewItem } = await import("./interop")
        const { getCompareStore } = await import("./state")

        await addNewItem(data, "png", source)
        await addNewItem(new Uint8Array([2]), "png", { ...source, projectId: 2 })
        await addNewItem(data, "png", { ...source, tensorId: "tensor2" })
        await addNewItem(data, "png", { ...source, tensorId: null })
        await addNewItem(data, "png", { ...source, tensorId: null })

        expect((await getCompareStore()).state.items).toHaveLength(5)
        expect(mocks.toast.mock.calls.map(([toast]) => toast.type)).toEqual(
            Array(5).fill("success"),
        )
    })

    it("reports a Metadata item already in Compare without marking new activity", async () => {
        const { addMediaItem } = await import("./interop")
        const { getCompareStore } = await import("./state")
        const { default: mediaStore } = await import("@/state/mediaStore")
        const metadata = mediaStore.defineCollection("metadata", {})
        const item = await metadata.addItem(data, "png", {})
        if (!item) throw new Error("Metadata fixture was not added")

        await addMediaItem(item.id)
        expect(mocks.toast).toHaveBeenLastCalledWith({
            title: "Image added to Compare",
            type: "success",
        })
        expect(mocks.sidebarActivity.compare).toBe(true)

        mocks.sidebarActivity.compare = false
        await addMediaItem(item.id)

        const { state } = await getCompareStore()
        expect(state.items.map(({ id }) => id)).toEqual([item.id])
        expect(state.imageB).toBeUndefined()
        expect(mocks.sidebarActivity.compare).toBe(false)
        expect(mocks.toast).toHaveBeenLastCalledWith({
            title: "Image already in Compare",
            type: "info",
        })
    })

    it("reports other errors from either add path", async () => {
        const { addNewItem, addMediaItem } = await import("./interop")
        const { getCompareStore } = await import("./state")
        mocks.withSnapshot.mockRejectedValueOnce("Could not write file")

        await addNewItem(data, "png", source)
        await addMediaItem("missing")

        expect((await getCompareStore()).state.items).toEqual([])
        expect(mocks.sidebarActivity.compare).toBe(false)
        expect(mocks.toast.mock.calls.map(([toast]) => toast)).toEqual([
            {
                title: "Could not add image to Compare",
                type: "error",
                description: "Could not write file",
            },
            {
                title: "Could not add image to Compare",
                type: "error",
                description: "Item missing not found",
            },
        ])
    })

    it("reports a display error after an image was added", async () => {
        const { addNewItem } = await import("./interop")
        const { getCompareStore } = await import("./state")
        mocks.decode.mockRejectedValueOnce(new Error("Decode failed"))

        await addNewItem(data, "png", source)

        const { state } = await getCompareStore()
        expect(state.items).toHaveLength(1)
        expect(state.imageA).toBeUndefined()
        expect(mocks.sidebarActivity.compare).toBe(true)
        expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
            title: "Image added to Compare",
            type: "warning",
            description: "Could not display the image. Decode failed",
        })
    })
})

describe("Compare selection", () => {
    async function fixture() {
        const store = await (await import("./state")).getCompareStore()
        const a = await store.addNewItem(data, "png", source)
        const b = await store.addNewItem(new Uint8Array([2]), "png", { ...source, tensorId: "b" })
        if (!a || !b) throw new Error("Missing Compare fixtures")
        return { ...store, a, b }
    }

    it.each(["A", "B"] as const)("keeps the latest selection for %s", async (side) => {
        const { state, selectItem, a, b } = await fixture()
        const olderDecode = Promise.withResolvers<void>()
        const newerDecode = Promise.withResolvers<void>()
        mocks.decode
            .mockReturnValueOnce(olderDecode.promise)
            .mockReturnValueOnce(newerDecode.promise)
        const older = selectItem(a, side)
        const newer = selectItem(b, side)
        expect(state.loading[side === "A" ? "a" : "b"]).toBe(b.id)
        newerDecode.resolve()
        await newer
        olderDecode.resolve()
        await older
        expect(state[side === "A" ? "imageA" : "imageB"]?.id).toBe(b.id)
        expect(state.loading).toEqual({ a: undefined, b: undefined })
    })

    it.each(["clear slot", "remove item", "clear images"])(
        "invalidates a pending selection on %s, even after undoing clear images",
        async (action) => {
            const { state, selectItem, removeItem, clearItems, a } = await fixture()
            const decode = Promise.withResolvers<void>()
            mocks.decode.mockReturnValueOnce(decode.promise)
            const pending = selectItem(a, "A")
            if (action === "clear slot") await selectItem(undefined, "A")
            else if (action === "remove item") await removeItem(a)
            else {
                clearItems()
                state.softRemovedItems.clear()
            }
            expect(state.loading.a).toBeUndefined()
            decode.resolve()
            await pending
            expect(state.imageA).toBeUndefined()
        },
    )

    it.each(["firstEmpty", "firstEmptyOrB"] as const)(
        "reserves independent slots before decoding with %s",
        async (side) => {
            const { state, selectItem, a, b } = await fixture()
            const decodeA = Promise.withResolvers<void>()
            const decodeB = Promise.withResolvers<void>()
            mocks.decode.mockReturnValueOnce(decodeA.promise).mockReturnValueOnce(decodeB.promise)
            const pendingA = selectItem(a, side)
            const pendingB = selectItem(b, side)
            expect(state.loading).toEqual({ a: a.id, b: b.id })
            decodeB.resolve()
            await pendingB
            expect(state.imageA).toBeUndefined()
            expect(state.imageB?.id).toBe(b.id)
            decodeA.resolve()
            await pendingA
            expect(state.imageA?.id).toBe(a.id)
        },
    )

    it("skips decoding firstEmpty when both slots are occupied", async () => {
        const { selectItem, a, b } = await fixture()
        await selectItem(a, "A")
        await selectItem(b, "B")
        mocks.decode.mockClear()
        await selectItem(a, "firstEmpty")
        expect(mocks.decode).not.toHaveBeenCalled()
    })

    it("clears a failed load without changing the selected image", async () => {
        const { state, selectItem, a, b } = await fixture()
        await selectItem(a, "A")
        mocks.decode.mockRejectedValueOnce(new Error("Decode failed"))
        await expect(selectItem(b, "A")).rejects.toThrow("Decode failed")
        expect(state.imageA?.id).toBe(a.id)
        expect(state.loading.a).toBeUndefined()
    })

    it("discards an obsolete decode failure without clearing the newer load", async () => {
        const { state, selectItem, a, b } = await fixture()
        const olderDecode = Promise.withResolvers<void>()
        const newerDecode = Promise.withResolvers<void>()
        mocks.decode
            .mockReturnValueOnce(olderDecode.promise)
            .mockReturnValueOnce(newerDecode.promise)
        const older = selectItem(a, "A")
        const newer = selectItem(b, "A")
        olderDecode.reject(new Error("Obsolete failure"))
        await older
        expect(state.loading.a).toBe(b.id)
        newerDecode.resolve()
        await newer
        expect(state.imageA?.id).toBe(b.id)
    })

    it("clears pin-restore history immediately on individual removal", async () => {
        const { state, removeItem, pinItem, clearPins, a, b } = await fixture()
        pinItem(a.id, true)
        state.clearPinsUndo.set(a.id, 1)
        clearPins()
        const removal = removeItem(b)
        expect(state.clearPinsUndo.size).toBe(0)
        await removal
    })
})
