import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    getMetadataStore: vi.fn(),
    updateSetting: vi.fn(),
}))
vi.mock("./metadataStore2", () => ({ getMetadataStore: mocks.getMetadataStore }))
vi.mock("@/state/settings", () => ({ updateSetting: mocks.updateSetting }))

import { loadImage2 } from "./interop"

beforeEach(() => vi.clearAllMocks())

describe("loadImage2", () => {
    it("serializes pasteboard loads and keeps the loading indicator active", async () => {
        const first = Promise.withResolvers<{ id: string; hasMetadata: () => Promise<boolean> }[]>()
        const second =
            Promise.withResolvers<{ id: string; hasMetadata: () => Promise<boolean> }[]>()
        const addMediaFromPasteboard = vi
            .fn()
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => second.promise)
        const state = { isLoadingImage: false }
        const selectImage = vi.fn()
        mocks.getMetadataStore.mockResolvedValue({
            state,
            collection: { addMediaFromPasteboard },
            selectImage,
        })

        const firstLoad = loadImage2("general")
        const secondLoad = loadImage2("drag")
        await vi.waitFor(() => expect(addMediaFromPasteboard).toHaveBeenCalledOnce())
        expect(state.isLoadingImage).toBe(true)

        first.resolve([{ id: "first", hasMetadata: vi.fn().mockResolvedValue(true) }])
        await firstLoad
        await vi.waitFor(() => expect(addMediaFromPasteboard).toHaveBeenCalledTimes(2))
        expect(state.isLoadingImage).toBe(true)
        expect(selectImage).toHaveBeenCalledWith("first")

        second.resolve([{ id: "second", hasMetadata: vi.fn().mockResolvedValue(true) }])
        await secondLoad
        expect(state.isLoadingImage).toBe(false)
        expect(selectImage).toHaveBeenLastCalledWith("second")
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
            collection: { addMediaFromPasteboard: vi.fn().mockResolvedValue([item]) },
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
