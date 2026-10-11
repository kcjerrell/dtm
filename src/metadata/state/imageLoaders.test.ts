// @vitest-environment jsdom
import * as plist from "plist"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MediaItemSource } from "@/state/mediaStore/types"
import {
    loadImageFromBuffer,
    loadImageFromDtp,
    loadImageFromFile,
    loadImageFromPasteboard,
    loadImageFromPose,
    loadImageFromUrl,
    loadMediaFromFile,
    loadMediaFromPasteboard,
    loadMediaFromUrl,
} from "./imageLoaders"

const io = vi.hoisted(() => ({
    getClipboardTypes: vi.fn<() => Promise<string[]>>(),
    getClipboardText: vi.fn<() => Promise<Record<string, string>>>(),
    getClipboardBinary: vi.fn<(type: string) => Promise<Uint8Array | undefined>>(),
    getLocalImage: vi.fn<(file: string) => Promise<Uint8Array | undefined>>(),
    fetchImage: vi.fn<(url: string) => Promise<{ data: Uint8Array; type: string } | undefined>>(),
    getExif: vi.fn<() => Promise<Record<string, unknown> | null>>(),
    listTensorHistoryNodes: vi.fn(),
    getResourceImage: vi.fn(),
    drawPose: vi.fn(),
}))

vi.mock("@/utils/clipboard", () => ({
    getClipboardTypes: io.getClipboardTypes,
    getClipboardText: io.getClipboardText,
    getClipboardBinary: io.getClipboardBinary,
    getLocalImage: io.getLocalImage,
    fetchImage: io.fetchImage,
}))
vi.mock("./imageMetadata", () => ({ getExif: io.getExif }))
vi.mock("@/commands", () => ({ DtpService: { getResourceImage: io.getResourceImage } }))
vi.mock("@/commands/DTProject", () => ({
    default: { listTensorHistoryNodes: io.listTensorHistoryNodes },
}))
vi.mock("@/utils/pose", () => ({ drawPose: io.drawPose }))
vi.mock("@/testHooks", () => ({
    getOverrideOr: async <T>(_name: string, fallback: () => Promise<T>) => fallback(),
}))

// Only signatures are needed: decoding and EXIF extraction are mocked.
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 0])
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
const webp = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])
const source: MediaItemSource = { loadedFrom: "test", uti: "public.png" }
const pose = { people: [{ pose_keypoints_2d: Array(54).fill(0) }], width: 512, height: 512 }
const dtExif = { exif: { UserComment: { value: JSON.stringify({ c: "a cat", uc: "", v2: {} }) } } }

beforeEach(() => {
    vi.resetAllMocks()
    io.getClipboardTypes.mockResolvedValue([])
    io.getClipboardText.mockResolvedValue({})
    io.getExif.mockResolvedValue(null)
    io.listTensorHistoryNodes.mockResolvedValue([])
})

describe("loadImageFromBuffer", () => {
    it("returns acquired bytes and source without copying or mutating them", async () => {
        const result = await loadImageFromBuffer(png, "png", source)
        expect(result).toEqual({ buffer: png, type: "png", source })
        expect(result?.buffer).toBe(png)
        expect(source).toEqual({ loadedFrom: "test", uti: "public.png" })
    })

    it("accepts an omitted source", async () => {
        expect(await loadImageFromBuffer(png, "png")).toMatchObject({ buffer: png, type: "png" })
    })

    it.each([null, undefined])("ignores missing bytes (%s)", async (buffer) => {
        expect(await loadImageFromBuffer(buffer, "png", source)).toBeUndefined()
    })

    it.each(["mp4", "mov", "webm", "m4v"])("ignores %s video buffers", async (type) => {
        expect(await loadImageFromBuffer(png, type, source)).toBeUndefined()
    })
})

describe("loadImageFromFile", () => {
    it("reads a filesystem path and adds file provenance", async () => {
        const file = "/images/a cat.jpeg"
        io.getLocalImage.mockResolvedValue(jpg)
        expect(await loadImageFromFile(file, source)).toEqual({
            buffer: jpg,
            type: "jpg",
            source: { ...source, file },
        })
        expect(io.getLocalImage).toHaveBeenCalledExactlyOnceWith(file)
        expect(io.fetchImage).not.toHaveBeenCalled()
    })

    it("detects image bytes when the path has no extension", async () => {
        io.getLocalImage.mockResolvedValue(png)
        expect(await loadImageFromFile("/images/untitled")).toMatchObject({
            buffer: png,
            type: "png",
            source: { file: "/images/untitled" },
        })
    })

    it("returns undefined when the file cannot be read", async () => {
        expect(await loadImageFromFile("/images/missing.png")).toBeUndefined()
    })

    it("ignores video files", async () => {
        io.getLocalImage.mockResolvedValue(png)
        expect(await loadImageFromFile("/images/movie.mp4")).toBeUndefined()
    })
})

describe("loadImageFromUrl", () => {
    it.each(["/images/a cat.png", "file:///images/a%20cat.png", "files:///images/a%20cat.png"])(
        "loads %s through a decoded filesystem path",
        async (url) => {
            io.getLocalImage.mockResolvedValue(png)
            const result = await loadImageFromUrl(url, source)
            expect(io.getLocalImage).toHaveBeenCalledExactlyOnceWith("/images/a cat.png")
            expect(io.fetchImage).not.toHaveBeenCalled()
            expect(result).toMatchObject({
                buffer: png,
                type: "png",
                source: { ...source, file: "/images/a cat.png" },
            })
        },
    )

    it("uses the fetched content type and preserves remote provenance", async () => {
        const url = "https://example.test/image"
        io.fetchImage.mockResolvedValue({ data: jpg, type: "image/jpeg" })
        expect(await loadImageFromUrl(url, source)).toEqual({
            buffer: jpg,
            type: "jpg",
            source: { ...source, url },
        })
        expect(io.fetchImage).toHaveBeenCalledExactlyOnceWith(url)
        expect(io.getLocalImage).not.toHaveBeenCalled()
    })

    it.each(["cdn.discordapp.com", "media.discordapp.net"])(
        "removes Discord transformations but preserves signed parameters on %s",
        async (host) => {
            const url = `https://${host}/attachments/image.png?ex=123&hm=signature&format=webp&quality=lossless&width=100&height=200`
            io.fetchImage.mockResolvedValue({ data: png, type: "image/png" })
            expect(await loadImageFromUrl(url)).toMatchObject({ buffer: png, type: "png" })
            expect(io.fetchImage).toHaveBeenCalledExactlyOnceWith(
                `https://${host}/attachments/image.png?ex=123&hm=signature`,
            )
        },
    )

    it("does not strip transformation parameters from other hosts", async () => {
        const url = "https://example.test/image.png?format=webp&quality=90&width=100&height=200"
        io.fetchImage.mockResolvedValue({ data: png, type: "image/png" })
        await loadImageFromUrl(url)
        expect(io.fetchImage).toHaveBeenCalledExactlyOnceWith(url)
    })

    it("returns undefined when fetching yields no image", async () => {
        expect(await loadImageFromUrl("https://example.test/missing.png")).toBeUndefined()
    })

    it("ignores a fetched video even at an image URL", async () => {
        io.fetchImage.mockResolvedValue({ data: png, type: "video/mp4" })
        expect(await loadImageFromUrl("https://example.test/image.png")).toBeUndefined()
    })
})

describe("video acquisition", () => {
    it.each(["/videos/a cat.mp4", "file:///videos/a%20cat.mp4", "files:///videos/a%20cat.mp4"])(
        "references local video %s without reading its bytes",
        async (file) => {
            expect(await loadMediaFromFile(file, source)).toEqual({
                kind: "file",
                location: "/videos/a cat.mp4",
                type: "mp4",
                source: { ...source, file: "/videos/a cat.mp4", url: null },
            })
            expect(io.getLocalImage).not.toHaveBeenCalled()
        },
    )

    it("references a remote video with query parameters without fetching its bytes", async () => {
        const url = "https://example.test/movie.webm?token=123"
        expect(await loadMediaFromUrl(url, source)).toEqual({
            kind: "url",
            location: url,
            type: "webm",
            source: { ...source, url },
        })
        expect(io.fetchImage).not.toHaveBeenCalled()
    })

    it("acquires mixed Finder images and videos in order", async () => {
        io.getClipboardTypes.mockResolvedValue(["NSFilenamesPboardType"])
        io.getClipboardText.mockResolvedValue({
            NSFilenamesPboardType: plist.build(["/images/cat.png", "/videos/movie.mov"]),
        })
        io.getLocalImage.mockResolvedValue(png)
        expect(await loadMediaFromPasteboard("drag")).toEqual([
            {
                buffer: png,
                type: "png",
                source: {
                    loadedFrom: "drop",
                    uti: "NSFilenamesPboardType",
                    url: "/images/cat.png",
                    file: "/images/cat.png",
                },
            },
            {
                kind: "file",
                location: "/videos/movie.mov",
                type: "mov",
                source: {
                    loadedFrom: "drop",
                    uti: "NSFilenamesPboardType",
                    file: "/videos/movie.mov",
                    url: null,
                },
            },
        ])
        expect(io.getLocalImage).toHaveBeenCalledTimes(1)
    })

    it("recognizes a video-only clipboard URL", async () => {
        io.getClipboardTypes.mockResolvedValue(["public.utf8-plain-text"])
        io.getClipboardText.mockResolvedValue({
            "public.utf8-plain-text": "https://example.test/movie.mp4",
        })
        expect(await loadMediaFromPasteboard("general")).toMatchObject([
            { kind: "url", type: "mp4", location: "https://example.test/movie.mp4" },
        ])
        expect(io.fetchImage).not.toHaveBeenCalled()
    })
})

describe("loadImageFromDtp", () => {
    it("resolves a preview to its tensor image and preserves project provenance", async () => {
        io.listTensorHistoryNodes.mockResolvedValue([
            { rowid: 42, tensorHistoryName: "tensor-42", project_path: "/projects/cats.db" },
        ])
        io.getResourceImage.mockResolvedValue(png)
        expect(await loadImageFromDtp(7, 11)).toEqual({
            buffer: png,
            type: "png",
            source: {
                loadedFrom: "project",
                projectFile: "/projects/cats.db",
                nodeId: 42,
                tensorId: "tensor-42",
            },
        })
        expect(io.listTensorHistoryNodes).toHaveBeenCalledExactlyOnceWith({
            projectId: 7,
            previewId: 11,
            select: "tensordata",
        })
        expect(io.getResourceImage).toHaveBeenCalledExactlyOnceWith(7, 42, "tensor-42")
    })

    it("returns undefined without fetching a resource when no history node exists", async () => {
        expect(await loadImageFromDtp(7, 11)).toBeUndefined()
        expect(io.getResourceImage).not.toHaveBeenCalled()
    })
})

describe("loadImageFromPose", () => {
    it("renders parsed pose data to PNG and preserves pose provenance", async () => {
        io.drawPose.mockResolvedValue(png)
        expect(await loadImageFromPose(JSON.stringify(pose), source)).toEqual({
            buffer: png,
            type: "png",
            source: { ...source, pose },
        })
        expect(io.drawPose).toHaveBeenCalledExactlyOnceWith(pose)
    })
})

describe("loadImageFromPasteboard", () => {
    it.each([
        ["general", "clipboard"],
        ["drag", "drop"],
    ] as const)("reads %s and records %s provenance", async (pasteboard, loadedFrom) => {
        io.getClipboardTypes.mockResolvedValue(["public.png"])
        io.getClipboardBinary.mockResolvedValue(png)
        expect(await loadImageFromPasteboard(pasteboard)).toEqual([
            { buffer: png, type: "png", source: { loadedFrom, uti: "public.png" } },
        ])
        expect(io.getClipboardTypes).toHaveBeenCalledExactlyOnceWith(pasteboard)
        expect(io.getClipboardText).toHaveBeenCalledExactlyOnceWith([], pasteboard)
        expect(io.getClipboardBinary).toHaveBeenCalledExactlyOnceWith("public.png", pasteboard)
    })

    it("prefers the first Draw Things candidate in UTI priority order, then stops", async () => {
        io.getClipboardTypes.mockResolvedValue(["public.webp", "public.jpeg", "public.png"])
        io.getClipboardBinary.mockImplementation(async (uti) => {
            return { "public.png": png, "public.jpeg": jpg, "public.webp": webp }[uti]
        })
        io.getExif.mockResolvedValueOnce({ exif: { Make: "Camera" } }).mockResolvedValue(dtExif)
        expect(await loadImageFromPasteboard("general")).toEqual([
            { buffer: jpg, type: "jpg", source: { loadedFrom: "clipboard", uti: "public.jpeg" } },
        ])
        expect(io.getClipboardBinary.mock.calls.map(([uti]) => uti)).toEqual([
            "public.png",
            "public.jpeg",
        ])
        expect(io.getExif).toHaveBeenCalledTimes(2)
    })

    it("falls back to the first image when none has valid Draw Things metadata", async () => {
        io.getClipboardTypes.mockResolvedValue(["public.jpeg", "public.png"])
        io.getClipboardBinary.mockImplementation(async (uti) => (uti === "public.png" ? png : jpg))
        io.getExif.mockResolvedValue({ exif: { UserComment: { value: "not JSON" } } })
        expect(await loadImageFromPasteboard("general")).toEqual([
            { buffer: png, type: "png", source: { loadedFrom: "clipboard", uti: "public.png" } },
        ])
        expect(io.getExif).toHaveBeenCalledTimes(2)
    })

    it("returns every acquired NSFilenames image in order, skipping missing files and videos", async () => {
        const files = [
            "/images/first.png",
            "/images/missing.png",
            "/images/movie.mp4",
            "/images/last.jpg",
        ]
        io.getClipboardTypes.mockResolvedValue(["public.png", "NSFilenamesPboardType"])
        io.getClipboardText.mockResolvedValue({ NSFilenamesPboardType: plist.build(files) })
        io.getLocalImage.mockImplementation(async (file) => {
            if (file === files[0]) return png
            if (file === files[3]) return jpg
            return undefined
        })
        io.getExif.mockResolvedValue(dtExif)
        const result = await loadImageFromPasteboard("drag")
        expect(result).toHaveLength(2)
        expect(result).toMatchObject([
            {
                buffer: png,
                type: "png",
                source: { loadedFrom: "drop", uti: "NSFilenamesPboardType", file: files[0] },
            },
            {
                buffer: jpg,
                type: "jpg",
                source: { loadedFrom: "drop", uti: "NSFilenamesPboardType", file: files[3] },
            },
        ])
        expect(io.getClipboardBinary).not.toHaveBeenCalled()
    })

    it("uses the real HTML reader to acquire an image URL", async () => {
        const url = "https://example.test/cat.png"
        io.getClipboardTypes.mockResolvedValue(["public.html"])
        io.getClipboardText.mockResolvedValue({ "public.html": `<img src="${url}" alt="cat">` })
        io.fetchImage.mockResolvedValue({ data: png, type: "image/png" })
        expect(await loadImageFromPasteboard("general")).toEqual([
            {
                buffer: png,
                type: "png",
                source: { loadedFrom: "clipboard", uti: "public.html", url },
            },
        ])
        expect(io.getClipboardText).toHaveBeenCalledExactlyOnceWith(["public.html"], "general")
        expect(io.getClipboardBinary).not.toHaveBeenCalled()
    })

    it("recognizes pose JSON through the plain-text reader", async () => {
        io.getClipboardTypes.mockResolvedValue(["public.utf8-plain-text"])
        io.getClipboardText.mockResolvedValue({ "public.utf8-plain-text": JSON.stringify(pose) })
        io.drawPose.mockResolvedValue(png)
        expect(await loadImageFromPasteboard("drag")).toEqual([
            {
                buffer: png,
                type: "png",
                source: { loadedFrom: "drop", uti: "public.utf8-plain-text", pose },
            },
        ])
        expect(io.drawPose).toHaveBeenCalledExactlyOnceWith(pose)
    })

    it("continues after an unreadable UTI instead of losing a later image", async () => {
        io.getClipboardTypes.mockResolvedValue(["NSFilenamesPboardType", "public.png"])
        io.getClipboardText.mockResolvedValue({ NSFilenamesPboardType: "not a plist" })
        io.getClipboardBinary.mockResolvedValue(png)
        expect(await loadImageFromPasteboard("general")).toMatchObject([
            { buffer: png, type: "png" },
        ])
    })

    it("returns an empty array for an empty pasteboard", async () => {
        expect(await loadImageFromPasteboard("general")).toEqual([])
        expect(io.getClipboardBinary).not.toHaveBeenCalled()
        expect(io.getExif).not.toHaveBeenCalled()
    })

    it("ignores video-only pasteboard contents", async () => {
        io.getClipboardTypes.mockResolvedValue(["public.utf8-plain-text"])
        io.getClipboardText.mockResolvedValue({
            "public.utf8-plain-text": "https://example.test/movie.mp4",
        })
        io.fetchImage.mockResolvedValue({ data: png, type: "video/mp4" })
        expect(await loadImageFromPasteboard("general")).toEqual([])
    })
})
