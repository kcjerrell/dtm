import { beforeEach, describe, expect, it, vi } from "vitest"

const fs = vi.hoisted(() => ({
    exists: vi.fn().mockResolvedValue(true),
    mkdir: vi.fn(),
    readDir: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@tauri-apps/api", () => ({
    path: {
        appDataDir: async () => "/app",
        join: async (...parts: string[]) => parts.join("/"),
        basename: async (name: string) => name.split("/").at(-1),
    },
}))
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => `asset://${path}` }))
vi.mock("@tauri-apps/plugin-fs", () => fs)
vi.mock("@/utils/helpers", () => ({ getStoreName: (name: string) => name }))

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

describe("orphaned media files", () => {
    it("removes only generated files not referenced by persisted media", async () => {
        fs.readDir.mockResolvedValue([
            entry("aaaaaaaaaaaa.png"),
            entry("bbbbbbbbbbbb.webp"),
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
            ["/app/media/cccccccccccc.mp4"],
        ])
    })

    it("leaves files being written alone", async () => {
        fs.readDir.mockResolvedValue([entry("ffffffffffff.png")])
        let finishWrite: (() => void) | undefined
        fs.writeFile.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    finishWrite = resolve
                }),
        )
        const { MediaStoreFiles } = await import("./files")

        const saving = MediaStoreFiles.saveFile("ffffffffffff", new Uint8Array([1]), "png")
        await MediaStoreFiles.removeOrphanedFiles(new Set())

        expect(fs.remove).not.toHaveBeenCalled()
        finishWrite?.()
        await saving
    })
})
