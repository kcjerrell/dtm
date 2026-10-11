import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MediaState } from "@/state/mediaStore/types"
import { MdVideo } from "./MdVideo"

const mocks = vi.hoisted(() => ({
    getVideoMetadata: vi.fn<(path: string) => Promise<Record<string, unknown>>>(),
    getDrawThingsDataFromVideo: vi.fn(),
}))
vi.mock("@/commands", () => ({ getVideoMetadata: mocks.getVideoMetadata }))
vi.mock("../helpers", () => ({ getDrawThingsDataFromVideo: mocks.getDrawThingsDataFromVideo }))

function video(storage: MediaState["storage"]): MdVideo {
    const item: MediaState = {
        id: "video-1",
        type: "mp4",
        url: storage.kind === "url" ? storage.url : "asset://localhost/movie.mp4",
        thumbUrl: "",
        source: {},
        storage,
        createdAt: 123,
    }
    return new MdVideo(item, { pin: null })
}

beforeEach(() => vi.resetAllMocks())

describe("MdVideo", () => {
    it("reads metadata from a referenced file and retains collection identity", async () => {
        const metadata = { format: { title: "movie" } }
        const dtData = { c: "prompt" }
        mocks.getVideoMetadata.mockResolvedValue(metadata)
        mocks.getDrawThingsDataFromVideo.mockReturnValue(dtData)
        const item = video({ kind: "file", path: "/videos/movie.mp4" })
        expect(item.id).toBe("video-1")
        expect(item.isVideo).toBe(true)
        expect(await item.hasMetadata()).toBe(true)
        expect(item.metadata).toEqual(metadata)
        expect(item.dtData).toBe(dtData)
        expect(item.metadataStatus).toBe("done")
        expect(mocks.getVideoMetadata).toHaveBeenCalledExactlyOnceWith("/videos/movie.mp4")
    })

    it("does not pass a remote URL to the local FFmpeg command", async () => {
        const item = video({ kind: "url", url: "https://example.test/movie.mp4" })
        expect(item.url).toBe("https://example.test/movie.mp4")
        expect(await item.hasMetadata()).toBe(false)
        expect(item.metadataStatus).toBe("done")
        expect(mocks.getVideoMetadata).not.toHaveBeenCalled()
    })

    it("can retry failed local metadata after FFmpeg becomes available", async () => {
        mocks.getVideoMetadata.mockRejectedValueOnce(new Error("FFmpeg missing"))
        mocks.getVideoMetadata.mockResolvedValueOnce({ format: {} })
        const item = video({ kind: "file", path: "/videos/movie.mp4" })
        expect(await item.hasMetadata()).toBe(false)
        expect(item.metadataStatus).toBe("failed")
        await item.loadMetadata(true)
        expect(item.metadataStatus).toBe("done")
        expect(mocks.getVideoMetadata).toHaveBeenCalledTimes(2)
    })
})
