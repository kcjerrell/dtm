import { beforeEach, describe, expect, it, vi } from "vitest"

const invoke = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const fs = vi.hoisted(() => ({
    exists: vi.fn().mockResolvedValue(true),
    mkdir: vi.fn(),
    readDir: vi.fn(),
    readFile: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
}))
const createImageThumbnail = vi.hoisted(() => vi.fn())

vi.mock("@tauri-apps/api", () => ({
    path: {
        appDataDir: async () => "/app",
        join: async (...parts: string[]) => parts.join("/"),
        basename: async (name: string) => name.split("/").at(-1),
    },
}))
vi.mock("@tauri-apps/api/core", () => ({
    convertFileSrc: (path: string) => `asset://${path}`,
    invoke,
}))
vi.mock("@tauri-apps/plugin-fs", () => fs)
vi.mock("@/utils/helpers", () => ({ getStoreName: (name: string) => name }))
vi.mock("./thumbnail", () => ({ createImageThumbnail }))

type Entry = { name: string; isFile: boolean; isDirectory: boolean; isSymlink: boolean }
function entry(name: string, kind: "file" | "directory" | "symlink" = "file"): Entry {
    return {
        name,
        isFile: kind === "file",
        isDirectory: kind === "directory",
        isSymlink: kind === "symlink",
    }
}

beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    fs.exists.mockResolvedValue(true)
    fs.remove.mockResolvedValue(undefined)
    fs.writeFile.mockResolvedValue(undefined)
})

it("allows replacing the destination of a user-selected copy", async () => {
    const { MediaStoreFiles } = await import("./files")

    await MediaStoreFiles.saveCopy("aaaaaaaaaaaa.png", "/export.png")

    expect(invoke).toHaveBeenCalledWith("stage_media_snapshot", {
        source: { kind: "file", location: "/app/media/aaaaaaaaaaaa.png" },
        destination: "/export.png",
        replaceExisting: true,
    })
})

it("saves a copy of a file-backed video from the original path", async () => {
    const { MediaStoreFiles } = await import("./files")

    await MediaStoreFiles.saveFileCopy("/videos/movie.mp4", "/export.mp4")

    expect(invoke).toHaveBeenCalledWith("stage_media_snapshot", {
        source: { kind: "file", location: "/videos/movie.mp4" },
        destination: "/export.mp4",
        replaceExisting: true,
    })
    expect(fs.exists).not.toHaveBeenCalled()
})

it("saves a PNG thumbnail beside a new image snapshot and removes both together", async () => {
    const data = new Uint8Array([1])
    const thumbnail = new Uint8Array([2])
    fs.readFile.mockResolvedValueOnce(data)
    createImageThumbnail.mockResolvedValueOnce(thumbnail)
    const { MediaStoreFiles } = await import("./files")
    const thumbUrl = await MediaStoreFiles.withSnapshot(
        "aaaaaaaaaaaa",
        { kind: "file", location: "/images/source.jpg" },
        "jpg",
        async (file, retain) => {
            const url = await file.createThumbnail()
            retain()
            return url
        },
    )

    expect(fs.readFile).toHaveBeenCalledWith("/app/media/aaaaaaaaaaaa.jpg")
    expect(createImageThumbnail).toHaveBeenCalledWith(data, "jpg")
    expect(thumbUrl).toBe("asset:///app/media/aaaaaaaaaaaat.png")
    expect(fs.writeFile).toHaveBeenCalledExactlyOnceWith(
        "/app/media/aaaaaaaaaaaat.png",
        thumbnail,
        { createNew: true },
    )
    expect(fs.remove).not.toHaveBeenCalled()
    await MediaStoreFiles.removeSnapshot("aaaaaaaaaaaa.jpg")
    expect(fs.remove.mock.calls).toEqual([
        ["/app/media/aaaaaaaaaaaa.jpg"],
        ["/app/media/aaaaaaaaaaaat.png"],
    ])
})

it("removes the staged original when thumbnail generation fails", async () => {
    const error = new Error("image decode failed")
    createImageThumbnail.mockRejectedValueOnce(error)
    const { MediaStoreFiles } = await import("./files")

    await expect(
        MediaStoreFiles.withSnapshot("aaaaaaaaaaaa", new Uint8Array([1]), "png", (file) =>
            file.createThumbnail(),
        ),
    ).rejects.toMatchObject({ cause: error })
    expect(fs.remove).toHaveBeenCalledExactlyOnceWith("/app/media/aaaaaaaaaaaa.png")
})

describe("orphaned media files", () => {
    it("removes only generated files not referenced by persisted media", async () => {
        fs.readDir.mockResolvedValue([
            entry("aaaaaaaaaaaa.png"),
            entry("aaaaaaaaaaaat.png"),
            entry("bbbbbbbbbbbb.webp"),
            entry("bbbbbbbbbbbbt.png"),
            entry("cccccccccccc.mp4"),
            entry("notes.txt"),
            entry("dddddddddddd.png", "directory"),
            entry("eeeeeeeeeeee.png", "symlink"),
            entry("legacy-image.png"),
        ])
        const { MediaStoreFiles } = await import("./files")

        await MediaStoreFiles.removeOrphanedFiles(new Set(["aaaaaaaaaaaa.png"]))

        expect(fs.remove.mock.calls).toEqual([
            ["/app/media/bbbbbbbbbbbb.webp"],
            ["/app/media/bbbbbbbbbbbbt.png"],
            ["/app/media/cccccccccccc.mp4"],
        ])
    })

    it("leaves files being written alone", async () => {
        fs.readDir.mockResolvedValue([entry("ffffffffffff.png"), entry("fffffffffffft.png")])
        const started = Promise.withResolvers<void>()
        const finish = Promise.withResolvers<Uint8Array>()
        createImageThumbnail.mockImplementationOnce(() => {
            started.resolve()
            return finish.promise
        })
        const { MediaStoreFiles } = await import("./files")

        const saving = MediaStoreFiles.withSnapshot(
            "ffffffffffff",
            new Uint8Array([1]),
            "png",
            async (file, retain) => {
                await file.createThumbnail()
                retain()
            },
        )
        await started.promise
        await MediaStoreFiles.removeOrphanedFiles(new Set())

        expect(fs.remove).not.toHaveBeenCalled()
        finish.resolve(new Uint8Array([2]))
        await saving
    })
})
