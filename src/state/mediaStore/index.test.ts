import { proxy } from "valtio"
import { beforeEach, describe, expect, it, vi } from "vitest"

const io = vi.hoisted(() => ({
    saveFile: vi.fn(),
    removeFile: vi.fn(),
    convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}))
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: io.convertFileSrc }))
vi.mock("./files", () => ({ MediaStoreFiles: io }))
vi.mock("@/lifecycle", () => ({ default: { onExit: vi.fn() } }))
vi.mock("@tauri-store/valtio", () => ({
    store: (_name: string, initial: object) => ({
        state: proxy(initial),
        start: async () => {},
    }),
}))

import MediaStore from "./index"

beforeEach(() => vi.clearAllMocks())

describe("referenced video media-store entries", () => {
    const collection = MediaStore.defineCollection("video-test", { pin: null as number | null })

    it.each([
        ["file", "/videos/movie.mp4", "asset:///videos/movie.mp4"],
        ["url", "https://example.test/movie.mp4", "https://example.test/movie.mp4"],
    ] as const)("creates a %s item without caching bytes", async (kind, location, expectedUrl) => {
        await collection.waitForReady()
        const item = await collection.addMedia({ kind, location, type: "mp4", source: {} })
        expect(item?.storage).toEqual(
            kind === "file" ? { kind, path: location } : { kind, url: location },
        )
        expect(item?.url).toBe(expectedUrl)
        expect(io.saveFile).not.toHaveBeenCalled()
        if (!item) throw new Error("expected a video item")
        collection.removeItems(item.id)
        expect(io.removeFile).not.toHaveBeenCalled()
    })

    it("rejects attempts to cache video bytes", async () => {
        await expect(collection.addItem(new Uint8Array([1]), "mp4", {})).rejects.toThrow(
            "videos must be referenced",
        )
        expect(io.saveFile).not.toHaveBeenCalled()
    })
})

describe("media-store reset", () => {
    it("clears every collection, awaits cached-file cleanup, and keeps collections usable", async () => {
        const images = MediaStore.defineCollection("reset-images", {}, { version: 1 })
        const videos = MediaStore.defineCollection("reset-videos", {})
        await Promise.all([images.waitForReady(), videos.waitForReady()])
        const imageItems = images.items
        io.saveFile.mockResolvedValue({ fname: "cached.png", url: "asset://cached.png" })
        await images.addItem(new Uint8Array([1]), "png", {})
        await videos.addMedia({ kind: "file", location: "/videos/movie.mp4", type: "mp4" })
        await videos.addMedia({
            kind: "url",
            location: "https://example.test/movie.mp4",
            type: "mp4",
        })

        const cleanup = Promise.withResolvers<void>()
        io.removeFile.mockReturnValueOnce(cleanup.promise)
        let completed = false
        const resetting = MediaStore.reset().then(() => {
            completed = true
        })
        await vi.waitFor(() => expect(io.removeFile).toHaveBeenCalledWith("cached.png"))
        expect(completed).toBe(false)
        cleanup.resolve()
        await resetting

        expect(images.items).toBe(imageItems)
        expect(images.items).toHaveLength(0)
        expect(videos.items).toHaveLength(0)
        expect(io.removeFile).toHaveBeenCalledTimes(1)
        expect(MediaStore.getCollection("reset-images")?.isReady).toBe(true)
        const item = await images.addMedia({
            kind: "url",
            location: "https://example.test/image.png",
            type: "png",
        })
        expect(images.items).toEqual([item])
        await MediaStore.reset()
    })
})
