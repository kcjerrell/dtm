import { describe, expect, it, vi } from "vitest"
import {
    createMediaStore,
    type MediaMigration,
    type MediaState,
    migrateMediaState,
    type StoredMedia,
    validateMediaState,
} from "./index"

const media = (id: string): Omit<StoredMedia, "collections"> => ({
    id,
    type: "png",
    source: { loadedFrom: "open", file: "/image.png" },
    storage: { kind: "imageStore", id },
    createdAt: 1,
})
const compare = (pin?: number) => ({
    addedAt: 2,
    addedFrom: { kind: "metadata" as const, mediaId: "a" },
    ...(pin === undefined ? {} : { pin }),
})
function setup(raw: unknown = { version: 1, media: {} }, steps: MediaMigration[] = []) {
    let persisted = raw
    const backing = {
        read: () => persisted,
        start: vi.fn(async () => {}),
        commit: vi.fn(async (s: MediaState) => {
            persisted = structuredClone(s)
        }),
        saveNow: vi.fn(async () => {}),
        stop: vi.fn(async () => {}),
    }
    const factory = vi.fn(async () => backing)
    const store = createMediaStore(factory, steps)
    return {
        store,
        backing,
        factory,
        metadata: store.collection("metadata"),
        compare: store.collection("compare"),
    }
}

describe("MediaStore collections", () => {
    it("shares membership, removes only a facet and reports orphans", async () => {
        const s = setup()
        await s.metadata.add(media("a"), { addedAt: 1 })
        await s.compare.attach("a", compare())
        expect(await s.metadata.remove("a")).toEqual({ id: "a", removed: true, orphaned: false })
        expect(await s.compare.has("a")).toBe(true)
        expect(await s.compare.remove("a")).toEqual({ id: "a", removed: true, orphaned: true })
        expect((await s.store.read()).media).toEqual({})
    })
    it("isolates updates, pins and clears", async () => {
        const s = setup()
        await s.metadata.add(media("a"), { addedAt: 1 })
        await s.metadata.add(media("b"), { addedAt: 2 })
        await s.compare.attach("a", compare())
        await s.metadata.pin("a")
        await s.metadata.update("a", { addedAt: 9 })
        expect((await s.compare.get("a"))?.collections.compare).toEqual(compare())
        expect(await s.metadata.clearUnpinned()).toEqual([
            { id: "b", removed: true, orphaned: true },
        ])
        await s.metadata.clearAll()
        expect(await s.compare.has("a")).toBe(true)
        expect(await s.metadata.list()).toEqual([])
    })
    it("normalizes pins by pin, addedAt and id independently", async () => {
        const raw = {
            version: 1,
            media: Object.fromEntries(
                ["c", "b", "a"].map((id) => [
                    id,
                    {
                        ...media(id),
                        collections: {
                            metadata: { addedAt: id === "c" ? 2 : 1, pin: 8 },
                            compare: compare(id === "c" ? 1 : 4),
                        },
                    },
                ]),
            ),
        }
        const s = setup(raw)
        const state = await s.store.read()
        expect(["a", "b", "c"].map((id) => state.media[id].collections.metadata?.pin)).toEqual([
            1, 2, 3,
        ])
        expect(["c", "a", "b"].map((id) => state.media[id].collections.compare?.pin)).toEqual([
            1, 2, 3,
        ])
        await s.metadata.unpin("a")
        await s.metadata.reconcilePins()
        expect((await s.metadata.get("b"))?.collections.metadata?.pin).toBe(1)
        expect((await s.compare.get("b"))?.collections.compare?.pin).toBe(3)
    })
    it("rejects duplicate/missing IDs and duplicate membership; missing removal is idempotent", async () => {
        const s = setup()
        await s.metadata.add(media("a"), { addedAt: 1 })
        await expect(s.compare.add(media("a"), compare())).rejects.toThrow("duplicate")
        await expect(s.metadata.attach("a", { addedAt: 2 })).rejects.toThrow("already belongs")
        await expect(s.compare.attach("missing", compare())).rejects.toThrow("missing media")
        await expect(s.compare.update("a", { addedAt: 4 })).rejects.toThrow("not in compare")
        await expect(s.metadata.pin("missing")).rejects.toThrow("missing media")
        expect(await s.metadata.get("missing")).toBeUndefined()
        expect(await s.metadata.remove("missing")).toEqual({
            id: "missing",
            removed: false,
            orphaned: false,
        })
    })
    it("preserves unknown facets and returns detached JSON-safe data", async () => {
        const s = setup({
            version: 1,
            media: {
                a: {
                    ...media("a"),
                    collections: { metadata: { addedAt: 1 }, future: { custom: [1, true] } },
                },
            },
        })
        const result = await s.metadata.get("a")
        if (result) result.source.file = "changed"
        expect((await s.metadata.get("a"))?.source.file).toBe("/image.png")
        expect((await s.metadata.remove("a")).orphaned).toBe(false)
        const state = await s.store.read()
        expect(JSON.parse(JSON.stringify(state))).toEqual(state)
        expect(state.media.a.collections).toEqual({ future: { custom: [1, true] } })
    })
    it("is lazy, caches facades and starts once for concurrent loads", async () => {
        const s = setup()
        expect(s.factory).not.toHaveBeenCalled()
        expect(s.store.collection("metadata")).toBe(s.metadata)
        const first = s.store.load()
        expect(s.store.load()).toBe(first)
        await Promise.all([first, s.metadata.list(), s.compare.list()])
        expect(s.factory).toHaveBeenCalledTimes(1)
        expect(s.backing.start).toHaveBeenCalledTimes(1)
    })
    it("serializes writes through persistence", async () => {
        const s = setup()
        const gate = Promise.withResolvers<void>()
        s.backing.saveNow.mockImplementationOnce(() => gate.promise)
        const a = s.metadata.add(media("a"), { addedAt: 1 })
        const b = s.metadata.add(media("b"), { addedAt: 2 })
        await vi.waitFor(() => expect(s.backing.saveNow).toHaveBeenCalledTimes(1))
        expect(s.backing.commit).toHaveBeenCalledTimes(1)
        gate.resolve()
        await Promise.all([a, b])
        expect((await s.metadata.list()).map((m) => m.id)).toEqual(["a", "b"])
    })
})

describe("migrations", () => {
    it("bypasses migrations and saving at current version", async () => {
        const migrate = vi.fn()
        const s = setup(undefined, [{ from: 1, to: 1, migrate }])
        await s.store.load()
        expect(migrate).not.toHaveBeenCalled()
        expect(s.backing.commit).not.toHaveBeenCalled()
        expect(s.backing.saveNow).not.toHaveBeenCalled()
    })
    it.each([{ media: {} }, { version: 0, media: {} }, { version: 2, media: {} }])(
        "fails closed for unsupported version %j",
        async (raw) => {
            const s = setup(raw)
            await expect(s.store.load()).rejects.toThrow(
                raw.version === 2 ? "future version" : "migration not implemented",
            )
            await expect(s.store.load()).rejects.toThrow()
            expect(s.factory).toHaveBeenCalledTimes(1)
            expect(s.backing.read()).toEqual(raw)
            expect(s.backing.commit).not.toHaveBeenCalled()
            expect(s.backing.saveNow).not.toHaveBeenCalled()
        },
    )
    it.each([
        { from: 0, to: 0, migrate: async () => ({ version: 0, media: {} }) },
        { from: 0, to: 1, migrate: async () => ({ version: 0, media: {} }) },
    ])("rejects non-advancement and target mismatch", async (step) => {
        await expect(migrateMediaState({ version: 0, media: {} }, [step])).rejects.toThrow(
            /non-advancement|target mismatch/,
        )
    })
    it("protects against partial mutation and commits successful chains once", async () => {
        const raw = { media: {} }
        const first: MediaMigration = {
            from: undefined,
            to: 0,
            migrate: async (s) => {
                ;(s as { version: number }).version = 0
                return s
            },
        }
        const bad: MediaMigration = {
            from: 0,
            to: 1,
            migrate: async () => {
                throw new Error("broken")
            },
        }
        const s = setup(raw, [first, bad])
        await expect(s.store.load()).rejects.toThrow("broken")
        expect(raw).toEqual({ media: {} })
        expect(s.backing.commit).not.toHaveBeenCalled()
        expect(s.backing.saveNow).not.toHaveBeenCalled()
        const good = setup(raw, [
            first,
            { from: 0, to: 1, migrate: async () => ({ version: 1, media: {} }) },
        ])
        await good.store.load()
        expect(good.backing.commit).toHaveBeenCalledTimes(1)
        expect(good.backing.saveNow).toHaveBeenCalledTimes(1)
    })
    it("validates final migration output before committing", async () => {
        const s = setup({ media: {} }, [
            { from: undefined, to: 1, migrate: async () => ({ version: 1, media: [] }) },
        ])
        await expect(s.store.load()).rejects.toThrow("media must be")
        expect(s.backing.commit).not.toHaveBeenCalled()
    })
})

describe("validation", () => {
    it.each([
        { id: "wrong" },
        { createdAt: Infinity },
        { storage: { kind: "unknown" } },
        { source: { nodeId: "bad" } },
        { collections: { metadata: { addedAt: 1, pin: 0 } } },
        { collections: { metadata: { addedAt: 1, pin: 1.5 } } },
        { collections: { compare: { addedAt: 1, addedFrom: {} } } },
        { cachePath: "/runtime" },
        { source: { runtime: new Map() } },
        { source: { runtime: () => {} } },
    ])("rejects malformed/runtime fields %j", (patch) => {
        expect(() =>
            validateMediaState({
                version: 1,
                media: { a: { ...media("a"), collections: {}, ...patch } },
            }),
        ).toThrow()
    })
    it.each([null, [], { version: 1.5, media: {} }, { version: 1, media: [] }])(
        "rejects malformed roots %j",
        (value) => {
            expect(() => validateMediaState(value)).toThrow()
        },
    )
})

const adapter = vi.hoisted(() => ({
    raw: { version: 1, media: {} } as unknown,
    calls: [] as string[],
    options: {} as Record<string, unknown>,
    state: {} as Record<string, unknown>,
    onExit: vi.fn(),
}))
vi.mock("@tauri-store/valtio", () => ({
    store: vi.fn((_id, state, options) => {
        adapter.calls.push("create")
        adapter.options = options
        adapter.state = state
        return {
            state,
            start: async () => {
                adapter.calls.push("start")
                const result = options.hooks.beforeFrontendSync(adapter.raw)
                if (result) Object.assign(state, result)
            },
            stop: async () => {
                adapter.calls.push("stop")
            },
        }
    }),
    saveNow: async () => {
        adapter.calls.push("saveNow")
    },
    allowSave: async () => {
        adapter.calls.push("allowSave")
    },
    denySave: async () => {
        adapter.calls.push("denySave")
    },
}))
vi.mock("@tauri-apps/api/core", () => ({
    invoke: async (command: string) => {
        adapter.calls.push(command)
    },
}))
vi.mock("@/lifecycle", () => ({ default: { onExit: adapter.onExit } }))
vi.mock("@/utils/helpers", () => ({ getStoreName: (name: string) => `dev_${name}` }))

describe("Tauri adapter", () => {
    it("creates only on load and patches before immediate saving", async () => {
        expect(adapter.calls).toEqual([])
        const store = createMediaStore()
        expect(adapter.calls).toEqual([])
        await store.load()
        expect(adapter.calls).toEqual(["create", "denySave", "start"])
        expect(adapter.options).toMatchObject({
            autoStart: false,
            save: false,
            saveOnChange: false,
            saveOnExit: false,
        })
        expect(adapter.onExit).toHaveBeenCalledTimes(1)
        await store.collection("metadata").add(media("a"), { addedAt: 1 })
        expect(adapter.calls.slice(-4)).toEqual([
            "plugin:valtio|patch",
            "allowSave",
            "saveNow",
            "denySave",
        ])
        expect(adapter.state.version).toBe(1)
    })
    it("never stamps or saves a versionless backing store", async () => {
        adapter.calls = []
        adapter.raw = { media: {} }
        const store = createMediaStore()
        await expect(store.load()).rejects.toThrow("migration not implemented")
        expect(adapter.calls).toEqual(["create", "denySave", "start"])
        expect(adapter.state).toEqual({ media: {} })
        await adapter.onExit.mock.calls.at(-1)?.[0]()
        expect(adapter.calls).toEqual(["create", "denySave", "start", "stop"])
    })
})
