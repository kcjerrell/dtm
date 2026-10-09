import { proxy } from "valtio"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MediaStateCol, MediaStoreType } from "./types"

const fixtures = vi.hoisted(() => ({
    items: [] as MediaStateCol[],
    state: undefined as MediaStoreType | undefined,
    onExit: vi.fn<(callback: () => Promise<void>) => void>(),
    start: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    removeFile: vi.fn<(fname: string) => Promise<void>>().mockResolvedValue(undefined),
    removeOrphanedFiles: vi
        .fn<(files: ReadonlySet<string>) => Promise<void>>()
        .mockResolvedValue(undefined),
}))

vi.mock("@/lifecycle", () => ({ default: { onExit: fixtures.onExit } }))
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => `asset://${path}` }))
vi.mock("./files", () => ({ MediaStoreFiles: fixtures }))
vi.mock("@tauri-store/valtio", () => ({
    store: (_name: string, initial: MediaStoreType) => {
        const state = proxy({ ...initial, items: structuredClone(fixtures.items) })
        fixtures.state = state
        return { state, start: () => fixtures.start() }
    },
}))

function item(id: string, collections: string[]): MediaStateCol {
    return {
        id,
        type: "png",
        url: "",
        thumbUrl: "",
        source: {},
        storage: { kind: "app", fname: `${id}.png` },
        createdAt: 0,
        $col: Object.fromEntries(collections.map((id) => [id, {}])),
    }
}

beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    fixtures.items = []
    fixtures.state = undefined
    fixtures.start.mockResolvedValue(undefined)
    fixtures.removeFile.mockResolvedValue(undefined)
    fixtures.removeOrphanedFiles.mockResolvedValue(undefined)
})

afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
})

describe("media-store hydration", () => {
    it("migrates persisted items only after start restores them", async () => {
        const loading = Promise.withResolvers<void>()
        fixtures.start.mockImplementation(async () => {
            await loading.promise
            fixtures.state?.items.push(item("restored", ["images"]))
            if (fixtures.state) fixtures.state.version.images = 1
        })
        const { default: mediaStore } = await import("./index")
        const onMigrate = vi.fn((_from: number | undefined, _to: number, items: unknown[]) =>
            items.map(() => ({ migrated: true })),
        )
        const postMigrate = vi.fn()
        const collection = mediaStore.defineCollection(
            "images",
            { migrated: false },
            {
                version: 2,
                onMigrate,
                postMigrate,
            },
        )
        expect(onMigrate).not.toHaveBeenCalled()
        loading.resolve()

        await collection.waitForReady()
        await vi.waitFor(() => expect(postMigrate).toHaveBeenCalledOnce())
        expect(onMigrate).toHaveBeenCalledWith(1, 2, [
            { media: fixtures.state?.items[0], state: {} },
        ])
        expect(collection.items[0].migrated).toBe(true)
        expect(fixtures.state?.version.images).toBe(2)
    })
})

describe("media-store exit cleanup", () => {
    it("defers the orphan sweep until after startup and includes unloaded collections", async () => {
        fixtures.items = [item("only-b", ["b"])]
        const { default: mediaStore } = await import("./index")
        await mediaStore.waitForReady()

        expect(fixtures.removeOrphanedFiles).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(3000)
        expect(fixtures.removeOrphanedFiles).toHaveBeenCalledExactlyOnceWith(
            new Set(["only-b.png"]),
        )
    })

    it("keeps items for collections that were never defined", async () => {
        fixtures.items = [item("only-a", ["a"]), item("only-b", ["b"])]
        const { default: mediaStore } = await import("./index")
        mediaStore.defineCollection("a", {}, { getPersistIds: () => [] })
        await mediaStore.waitForReady()

        await fixtures.onExit.mock.calls[0][0]()

        expect(fixtures.state?.items.map((it) => it.id)).toEqual(["only-b"])
        expect(fixtures.state?.items[0].$col).toEqual({ b: {} })
        expect(fixtures.removeFile).toHaveBeenCalledExactlyOnceWith("only-a.png")
    })

    it("removes only the rejecting collection's data from shared items", async () => {
        fixtures.items = [item("shared", ["a", "b"]), item("only-b", ["b"])]
        const { default: mediaStore } = await import("./index")
        mediaStore.defineCollection("a", {}, { getPersistIds: () => ["shared"] })
        mediaStore.defineCollection("b", {}, { getPersistIds: () => [] })
        await mediaStore.waitForReady()

        await fixtures.onExit.mock.calls[0][0]()

        expect(fixtures.state?.items.map((it) => it.id)).toEqual(["shared"])
        expect(fixtures.state?.items[0].$col).toEqual({ a: {} })
        expect(fixtures.removeFile).toHaveBeenCalledExactlyOnceWith("only-b.png")
    })

    it("does not remove a shared file if an unloaded collection still owns it", async () => {
        fixtures.items = [item("shared", ["a", "b"])]
        const { default: mediaStore } = await import("./index")
        mediaStore.defineCollection("a", {}, { getPersistIds: () => [] })
        await mediaStore.waitForReady()

        await fixtures.onExit.mock.calls[0][0]()

        expect(fixtures.state?.items[0].$col).toEqual({ b: {} })
        expect(fixtures.removeFile).not.toHaveBeenCalled()
    })
})
