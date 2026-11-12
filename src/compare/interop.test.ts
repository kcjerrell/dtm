import { proxy } from "valtio"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MediaStateCol, MediaStoreType } from "@/state/mediaStore/types"

const mocks = vi.hoisted(() => ({
    sidebarActivity: { compare: false },
    toast: vi.fn(),
    saveFile: vi.fn(),
    decode: vi.fn(),
    items: [] as MediaStateCol[],
    updateSetting: vi.fn(),
}))

vi.mock("@/components/ui/toaster", () => ({ toaster: { create: mocks.toast } }))
vi.mock("@/hooks/appState", () => ({ default: { store: { sidebarActivity: mocks.sidebarActivity } } }))
vi.mock("@/lifecycle", () => ({ default: { onExit: vi.fn() } }))
vi.mock("@/state/settings", () => ({
    getFlag: () => true,
    getSetting: vi.fn(),
    updateSetting: mocks.updateSetting,
}))
vi.mock("@/state/mediaStore/files", () => ({ MediaStoreFiles: { saveFile: mocks.saveFile } }))
vi.mock("@tauri-store/valtio", () => ({
    store: (_name: string, state: MediaStoreType) => ({
        state: proxy({ ...state, items: structuredClone(mocks.items) }),
        start: async () => {},
    }),
}))

const data = new Uint8Array([1])
const source = { source: "project", projectFile: "/test/one.sqlite", tensorId: "tensor1" }

beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    mocks.items = []
    mocks.sidebarActivity.compare = false
    mocks.saveFile.mockImplementation(async (id: string) => ({
        fname: `${id}.png`,
        url: `asset://${id}.png`,
    }))
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
    it.each(["Compare", "Metadata"])("shares the same project image when sent to %s first", async (firstView) => {
        const { addMediaItem, addNewItem } = await import("./interop")
        const { getCompareStore } = await import("./state")
        const { sendToMetadata } = await import("@/metadata/state/interop")
        const { getMetadataStore } = await import("@/metadata/state/metadataStore2")
        if (firstView === "Compare") {
            await addNewItem(data, "png", source)
            await sendToMetadata(data, "png", source)
        } else {
            await sendToMetadata(data, "png", source)
            await addNewItem(data, "png", source)
        }

        const { state: compare } = await getCompareStore()
        const { state: metadata } = await getMetadataStore()
        expect(mocks.saveFile).toHaveBeenCalledOnce()
        expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({ title: "Image added to Compare", type: "success" })
        expect(metadata.currentItem?.id).toBe(compare.items[0].id)
        expect(mocks.updateSetting).toHaveBeenCalledWith("app.currentView", "metadata")

        await sendToMetadata(data, "png", source)
        expect(metadata.items).toEqual([metadata.currentItem])
        expect(mocks.toast).toHaveBeenLastCalledWith({ title: "Image already in Metadata", type: "info" })

        if (!metadata.currentItem) throw new Error("expected a selected Metadata item")
        await addMediaItem(metadata.currentItem.id)
        expect(compare.items).toHaveLength(1)
        expect(compare.imageB).toBeUndefined()
        expect(mocks.toast).toHaveBeenLastCalledWith({ title: "Image already in Compare", type: "info" })
    })

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
        expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({ title: "Image already in Compare", type: "info" })
    })

    it("adds a project tensor only once when two sends overlap", async () => {
        const { addNewItem } = await import("./interop")
        const { getCompareStore } = await import("./state")

        await Promise.all([
            addNewItem(data, "png", source),
            addNewItem(data, "png", { ...source, nodeId: 2 }),
        ])

        const { state } = await getCompareStore()
        expect(mocks.saveFile).toHaveBeenCalledOnce()
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
        await addNewItem(data, "png", { ...source, projectFile: "/test/two.sqlite" })
        await addNewItem(data, "png", { ...source, tensorId: "tensor2" })
        await addNewItem(data, "png", { ...source, tensorId: null })
        await addNewItem(data, "png", { ...source, tensorId: null })

        expect((await getCompareStore()).state.items).toHaveLength(5)
        expect(mocks.toast.mock.calls.map(([toast]) => toast.type)).toEqual(Array(5).fill("success"))
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
        mocks.saveFile.mockRejectedValueOnce("Could not write file")

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
