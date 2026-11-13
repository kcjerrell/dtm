import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    getMetadataStore: vi.fn(),
    updateSetting: vi.fn(),
    toast: vi.fn(),
}))
vi.mock("./metadataStore2", () => ({ getMetadataStore: mocks.getMetadataStore }))
vi.mock("@/state/settings", () => ({ updateSetting: mocks.updateSetting }))
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: mocks.toast } }))

import { loadImage2 } from "./interop"

beforeEach(() => vi.clearAllMocks())

type ImportedItem = { id: string; hasMetadata: () => Promise<boolean> }

describe("loadImage2", () => {
    it("serializes pasteboard loads and keeps the loading indicator active", async () => {
        const first = Promise.withResolvers<{ item: ImportedItem; alreadyPresent: boolean }[]>()
        const second = Promise.withResolvers<{ item: ImportedItem; alreadyPresent: boolean }[]>()
        const importMediaFromPasteboard = vi
            .fn()
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => second.promise)
        const state = { isLoadingImage: false }
        const selectImage = vi.fn()
        mocks.getMetadataStore.mockResolvedValue({
            state,
            collection: { importMediaFromPasteboard },
            selectImage,
        })

        const firstLoad = loadImage2("general")
        const secondLoad = loadImage2("drag")
        await vi.waitFor(() => expect(importMediaFromPasteboard).toHaveBeenCalledOnce())
        expect(state.isLoadingImage).toBe(true)

        first.resolve([
            { item: { id: "first", hasMetadata: vi.fn().mockResolvedValue(true) }, alreadyPresent: false },
        ])
        await firstLoad
        await vi.waitFor(() => expect(importMediaFromPasteboard).toHaveBeenCalledTimes(2))
        expect(state.isLoadingImage).toBe(true)
        expect(selectImage).toHaveBeenCalledWith("first")

        second.resolve([
            { item: { id: "second", hasMetadata: vi.fn().mockResolvedValue(true) }, alreadyPresent: true },
        ])
        await secondLoad
        expect(state.isLoadingImage).toBe(false)
        expect(selectImage).toHaveBeenLastCalledWith("second")
        expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
            title: "Image already in Metadata",
            type: "info",
        })
    })

    it("loads metadata before selecting the pasted item", async () => {
        const metadata = Promise.withResolvers<boolean>()
        const item = {
            id: "image",
            hasMetadata: vi.fn(() => metadata.promise),
        }
        const state = { isLoadingImage: false }
        const selectImage = vi.fn()
        mocks.getMetadataStore.mockResolvedValue({
            state,
            collection: {
                importMediaFromPasteboard: vi.fn().mockResolvedValue([{ item, alreadyPresent: false }]),
            },
            selectImage,
        })

        const load = loadImage2("general")
        await vi.waitFor(() => expect(item.hasMetadata).toHaveBeenCalledOnce())

        expect(selectImage).not.toHaveBeenCalled()
        expect(state.isLoadingImage).toBe(true)

        metadata.resolve(true)
        await load

        expect(selectImage).toHaveBeenCalledWith("image")
        expect(state.isLoadingImage).toBe(false)
    })
})
