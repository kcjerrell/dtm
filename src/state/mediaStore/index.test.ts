import { proxy } from "valtio"
import { beforeEach, describe, expect, it, vi } from "vitest"

const io = vi.hoisted(() => ({
    saveFile: vi.fn(),
    withSnapshot: vi.fn(),
    findMatchingFile: vi.fn(),
    removeFile: vi.fn(),
}))
vi.mock("./files", () => ({ MediaStoreFiles: io }))
vi.mock("@/lifecycle", () => ({ default: { onExit: vi.fn() } }))
vi.mock("@tauri-store/valtio", () => ({
    store: (_name: string, initial: object) => ({
        state: proxy(initial),
        start: async () => {},
    }),
}))

import MediaStore from "./index"

type SnapshotInput = Uint8Array | { kind: "file" | "url"; location: string }
type SavedFile = { fname: string; url: string }

const cachedFiles = new Map<string, Uint8Array>()
const incomingFiles = new Map<string, Uint8Array>()

function writeSnapshot(id: string, data: Uint8Array, type: string) {
    const fname = `${id}.${type}`
    cachedFiles.set(fname, data.slice())
    return { fname, url: `asset://${fname}` }
}

beforeEach(() => {
    vi.resetAllMocks()
    cachedFiles.clear()
    incomingFiles.clear()
    io.saveFile.mockImplementation(writeSnapshot)
    io.withSnapshot.mockImplementation(async (
        id: string,
        input: SnapshotInput,
        type: string,
        use: (file: SavedFile, retain: () => void) => Promise<unknown>,
    ) => {
        const bytes = input instanceof Uint8Array ? input : incomingFiles.get(input.location)
        if (!bytes) throw new Error("missing incoming file")
        const file = writeSnapshot(id, bytes, type)
        let retained = false
        try {
            return await use(file, () => { retained = true })
        } finally {
            if (!retained) cachedFiles.delete(file.fname)
        }
    })
    io.findMatchingFile.mockImplementation((incoming: string, candidates: string[]) => {
        const bytes = cachedFiles.get(incoming)
        const index = candidates.findIndex((fname) => {
            const candidate = cachedFiles.get(fname)
            return candidate && candidate.length === bytes?.length &&
                candidate.every((value, i) => value === bytes[i])
        })
        return index < 0 ? null : index
    })
})

describe("video media-store snapshots", () => {
    const collection = MediaStore.defineCollection("video-test", { pin: null as number | null })

    it.each([
        ["file", "/videos/movie.mp4"],
        ["url", "https://example.test/movie.mp4"],
    ] as const)("snapshots a %s video and reuses matching versions", async (kind, location) => {
        const source = { [kind]: location }
        const input = { kind, location, type: "mp4", source }
        incomingFiles.set(location, new Uint8Array([1]))
        const first = await collection.importMedia(input)
        const duplicate = await collection.importMedia(input)
        incomingFiles.set(location, new Uint8Array([2]))
        const changed = await collection.importMedia(input)

        expect(first.item?.storage).toEqual({ kind: "app", fname: `${first.item?.id}.mp4` })
        expect(first.item?.url).toBe(`asset://${first.item?.id}.mp4`)
        expect(duplicate).toEqual({ item: first.item, alreadyPresent: true })
        expect(changed.alreadyPresent).toBe(false)
        expect([...cachedFiles.values()]).toEqual([new Uint8Array([1]), new Uint8Array([2])])
        await collection.clear()
    })

    it("rejects attempts to cache video bytes", async () => {
        await expect(collection.addItem(new Uint8Array([1]), "mp4", {})).rejects.toThrow(
            "videos must be referenced",
        )
        expect(io.saveFile).not.toHaveBeenCalled()
    })
})

describe("file and URL image versions", () => {
    it.each([
        { file: "/images/cat.png" },
        { url: "https://example.test/cat.png" },
    ])("finds earlier versions and shares the matching snapshot for %j", async (source) => {
        const metadata = MediaStore.defineCollection(`versions-${Object.keys(source)[0]}`, { pin: 0 })
        const compare = MediaStore.defineCollection(`compare-${Object.keys(source)[0]}`, { pin: 0 })
        const image = { buffer: new Uint8Array([1]), type: "png", source }
        const original = await metadata.importMedia(image, { pin: 1 })
        const changed = await metadata.importMedia({ ...image, buffer: new Uint8Array([2]) })
        const restored = await metadata.importMedia(image)
        const shared = await compare.importMedia(image)

        expect(changed.alreadyPresent).toBe(false)
        expect(restored).toEqual({ item: original.item, alreadyPresent: true })
        expect(shared.item?.id).toBe(original.item?.id)
        expect(shared.alreadyPresent).toBe(false)
        expect(shared.item?.pin).toBe(0)
        expect(original.item?.pin).toBe(1)
        expect([...cachedFiles.values()]).toEqual([new Uint8Array([1]), new Uint8Array([2])])
        if (!changed.item) throw new Error("expected a changed version")
        expect((await compare.addExisting(changed.item.id))?.id).toBe(changed.item.id)
        expect(compare.items).toHaveLength(2)
        await metadata.clear()
        expect(io.removeFile).not.toHaveBeenCalledWith(`${original.item?.id}.png`)
        await compare.clear()
        expect(io.removeFile).toHaveBeenCalledWith(`${original.item?.id}.png`)
    })

    it("keeps identical bytes from distinct paths and raw clipboard pastes", async () => {
        const collection = MediaStore.defineCollection("different-sources", {})
        const image = { buffer: new Uint8Array([1]), type: "png" }
        await collection.importMedia({ ...image, source: { file: "/images/one.png" } })
        await collection.importMedia({ ...image, source: { file: "/images/two.png" } })
        const clipboard = { ...image, source: { loadedFrom: "clipboard" } }
        await collection.importMedia(clipboard)
        await collection.importMedia(clipboard)

        expect(collection.items).toHaveLength(4)
        expect(io.findMatchingFile).not.toHaveBeenCalled()
        await collection.clear()
    })
})

describe("media-store reset", () => {
    it("clears every collection, awaits cached-file cleanup, and keeps collections usable", async () => {
        const images = MediaStore.defineCollection("reset-images", {}, { version: 1 })
        const videos = MediaStore.defineCollection("reset-videos", {})
        await Promise.all([images.waitForReady(), videos.waitForReady()])
        io.saveFile.mockResolvedValue({ fname: "cached.png", url: "asset://cached.png" })
        incomingFiles.set("/videos/movie.mp4", new Uint8Array([1]))
        incomingFiles.set("https://example.test/movie.mp4", new Uint8Array([1]))
        incomingFiles.set("https://example.test/image.png", new Uint8Array([1]))
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
        async function resetStore() {
            await MediaStore.reset()
            completed = true
        }
        const resetting = resetStore()
        await vi.waitFor(() => expect(io.removeFile).toHaveBeenCalledWith("cached.png"))
        expect(completed).toBe(false)
        cleanup.resolve()
        await resetting

        expect(images.items).toHaveLength(0)
        expect(videos.items).toHaveLength(0)
        expect(io.removeFile).toHaveBeenCalledTimes(3)
        expect(MediaStore.getCollection("reset-images")).toBe(images)
        const item = await images.addMedia({
            kind: "url",
            location: "https://example.test/image.png",
            type: "png",
        })
        expect(images.items).toEqual([item])
        await MediaStore.reset()
    })
})
