import { Mutex } from "async-mutex"
import { proxy, subscribe as subscribeProxy } from "valtio"

export const MEDIA_STORE_VERSION = 1

/** Provenance, structurally compatible with Metadata's MediaItemSource. */
export interface MediaSource extends Record<string, unknown> {
    loadedFrom?: string
    type?: string
    uti?: string | null
    url?: string | null
    file?: string | null
    projectFile?: string | null
    nodeId?: number | null
    tensorId?: string | null
}

export type MediaStorage =
    | { kind: "imageStore"; id: string }
    | { kind: "file"; path: string }
    | { kind: "url"; url: string }
    | { kind: "project"; projectFile: string; nodeId: number; tensorId?: string }

export type CompareAddedFrom =
    | { kind: "metadata"; mediaId: string }
    | { kind: "projects"; projectFile: string; nodeId: number; tensorId?: string }

export interface MediaCollectionData {
    metadata: { addedAt: number; pin?: number }
    compare: { addedAt: number; pin?: number; addedFrom: CompareAddedFrom }
}
export type CollectionKey = keyof MediaCollectionData
export type MediaCollections = { [K in CollectionKey]?: MediaCollectionData[K] }
export interface StoredMedia {
    id: string
    type: string
    source: MediaSource
    storage: MediaStorage
    createdAt: number
    collections: MediaCollections
}
export type RawMediaState = {
    version?: number
    media: Record<string, StoredMedia>
}
export interface MediaState extends RawMediaState {
    version: typeof MEDIA_STORE_VERSION
}
type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T
export type ReactiveMediaState = DeepReadonly<MediaState>

/** Future migration loaders are supplied by the caller, never imported here. */
export interface MigrationContext {
    loadLegacyMetadata?: () => Promise<unknown>
    loadLegacyImageStore?: () => Promise<unknown>
}
export interface MediaMigration {
    from: number | undefined
    to: number
    migrate(state: unknown, context: MigrationContext): Promise<unknown>
}
export const mediaMigrations: readonly MediaMigration[] = Object.freeze([])

function fail(message: string): never {
    throw new Error(`MediaStore: ${message}`)
}
function record(value: unknown, path: string): asserts value is Record<string, unknown> {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    ) {
        fail(`${path} must be a plain object`)
    }
}
function string(value: unknown, path: string): asserts value is string {
    if (typeof value !== "string" || !value) fail(`${path} must be a nonempty string`)
}
function finite(value: unknown, path: string): asserts value is number {
    if (typeof value !== "number" || !Number.isFinite(value)) fail(`${path} must be finite`)
}
function integer(value: unknown, path: string): asserts value is number {
    finite(value, path)
    if (!Number.isSafeInteger(value)) fail(`${path} must be a safe integer`)
}
/** Reject lossy JSON conversions instead of silently dropping runtime data. */
function plainClone<T>(value: T): T {
    const seen = new Set<object>()
    function visit(v: unknown): void {
        if (v === null || typeof v === "string" || typeof v === "boolean") return
        if (typeof v === "number") {
            finite(v, "JSON number")
            return
        }
        if (typeof v !== "object" || !v) fail("state must be JSON-safe")
        if (seen.has(v)) fail("cyclic state")
        seen.add(v)
        if (!Array.isArray(v)) record(v, "JSON value")
        for (const key of Reflect.ownKeys(v)) {
            if (Array.isArray(v) && key === "length") continue
            const descriptor = Object.getOwnPropertyDescriptor(v, key)
            if (
                typeof key !== "string" ||
                !descriptor ||
                !("value" in descriptor) ||
                !descriptor.enumerable
            ) {
                fail("state must contain only plain JSON properties")
            }
            visit(descriptor.value)
        }
        if (Array.isArray(v) && Object.keys(v).length !== v.length) fail("sparse JSON array")
        seen.delete(v)
    }
    visit(value)
    return JSON.parse(JSON.stringify(value)) as T
}
function versionOf(value: unknown): number | undefined {
    record(value, "root")
    if (value.version === undefined) return undefined
    integer(value.version, "version")
    if (value.version < 0) fail("version must be nonnegative")
    return value.version as number
}
function locator(value: Record<string, unknown>, path: string) {
    string(value.projectFile, `${path}.projectFile`)
    integer(value.nodeId, `${path}.nodeId`)
    if (value.tensorId !== undefined) string(value.tensorId, `${path}.tensorId`)
}
function reconcile(state: RawMediaState, key: CollectionKey) {
    const pinned = Object.values(state.media).flatMap((m) => {
        const facet = m.collections[key]
        return facet?.pin === undefined ? [] : [{ id: m.id, facet, pin: facet.pin }]
    })
    pinned.sort(
        (a, b) =>
            a.pin - b.pin ||
            a.facet.addedAt - b.facet.addedAt ||
            (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    pinned.forEach(({ facet }, i) => {
        facet.pin = i + 1
    })
}

/** Validate first, then normalize a detached plain copy. Unknown facets survive. */
export function validateMediaState(input: unknown): MediaState {
    if (versionOf(input) !== MEDIA_STORE_VERSION) fail("expected current version 1")
    const state = plainClone(input)
    record(state, "root")
    record(state.media, "media")
    for (const [id, item] of Object.entries(state.media)) {
        record(item, `media.${id}`)
        string(item.id, "id")
        if (item.id !== id) fail(`key/id mismatch for ${id}`)
        string(item.type, "type")
        finite(item.createdAt, "createdAt")
        for (const key of Object.keys(item)) {
            if (!["id", "type", "source", "storage", "createdAt", "collections"].includes(key))
                fail(`unexpected media field ${key}`)
        }
        record(item.source, "source")
        for (const key of ["loadedFrom", "type", "uti", "url", "file", "projectFile", "tensorId"]) {
            const v = item.source[key]
            if (
                v !== undefined &&
                !(v === null && key !== "type" && key !== "loadedFrom") &&
                typeof v !== "string"
            )
                fail(`invalid source.${key}`)
        }
        if (item.source.nodeId != null) integer(item.source.nodeId, "source.nodeId")
        record(item.storage, "storage")
        const storage = item.storage
        switch (storage.kind) {
            case "imageStore":
                string(storage.id, "storage.id")
                break
            case "file":
                string(storage.path, "storage.path")
                break
            case "url":
                string(storage.url, "storage.url")
                break
            case "project":
                locator(storage, "storage")
                break
            default:
                fail(`unrecognized storage kind ${String(storage.kind)}`)
        }
        const storageKeys =
            storage.kind === "imageStore"
                ? ["kind", "id"]
                : storage.kind === "file"
                  ? ["kind", "path"]
                  : storage.kind === "url"
                    ? ["kind", "url"]
                    : ["kind", "projectFile", "nodeId", "tensorId"]
        for (const field of Object.keys(storage)) {
            if (!storageKeys.includes(field)) fail(`unexpected storage field ${field}`)
        }
        record(item.collections, "collections")
        for (const [key, facet] of Object.entries(item.collections)) {
            record(facet, `collections.${key}`)
            if (key !== "metadata" && key !== "compare") continue
            finite(facet.addedAt, `${key}.addedAt`)
            if (facet.pin !== undefined) {
                integer(facet.pin, `${key}.pin`)
                if (facet.pin <= 0) fail(`${key}.pin must be positive`)
            }
            if (key === "compare") {
                record(facet.addedFrom, "compare.addedFrom")
                if (facet.addedFrom.kind === "metadata")
                    string(facet.addedFrom.mediaId, "addedFrom.mediaId")
                else if (facet.addedFrom.kind === "projects") locator(facet.addedFrom, "addedFrom")
                else fail("unrecognized compare.addedFrom kind")
            }
        }
    }
    for (const key of Object.keys(state))
        if (key !== "version" && key !== "media") fail(`unexpected root field ${key}`)
    const result = state as unknown as MediaState
    reconcile(result, "metadata")
    reconcile(result, "compare")
    return result
}

export async function migrateMediaState(
    input: unknown,
    steps: readonly MediaMigration[] = mediaMigrations,
    context: MigrationContext = {},
): Promise<MediaState> {
    let version = versionOf(input)
    // An absent property is the persisted representation of undefined version.
    record(input, "root")
    const initial = { ...input }
    if (initial.version === undefined) delete initial.version
    let state: unknown = plainClone(initial)
    const visited = new Set<number | undefined>()
    while (version !== MEDIA_STORE_VERSION) {
        if (version !== undefined && version > MEDIA_STORE_VERSION)
            fail(`future version ${version} is unsupported`)
        if (visited.has(version)) fail("migration loop detected")
        visited.add(version)
        const matches = steps.filter((s) => s.from === version)
        if (!matches.length)
            fail(
                `migration not implemented: missing migration from ${String(version)} to ${MEDIA_STORE_VERSION}`,
            )
        if (matches.length !== 1) fail(`ambiguous migration from ${String(version)}`)
        const step = matches[0]
        integer(step.to, "migration target")
        if (visited.has(step.to)) fail("migration loop/non-advancement detected")
        if (step.to < 0 || (version !== undefined && step.to <= version))
            fail("migration must advance")
        if (step.to > MEDIA_STORE_VERSION) fail("migration target exceeds supported version")
        state = plainClone(await step.migrate(state, context))
        version = versionOf(state)
        if (version !== step.to)
            fail(`migration target mismatch: expected ${step.to}, received ${String(version)}`)
    }
    return validateMediaState(state)
}

export interface MediaBackingStore {
    read(): unknown
    start(): Promise<void>
    commit(state: MediaState): Promise<void>
    saveNow(): Promise<void>
    stop(): Promise<void>
}

async function createBackingStore(
    stopExclusively: (stop: () => Promise<void>) => Promise<void>,
): Promise<MediaBackingStore> {
    const [
        { store, saveNow, allowSave, denySave },
        { invoke },
        { default: Lifecycle },
        { getStoreName },
    ] = await Promise.all([
        import("@tauri-store/valtio"),
        import("@tauri-apps/api/core"),
        import("@/lifecycle"),
        import("@/utils/helpers"),
    ])
    const id = getStoreName("media")
    let loaded: unknown = { media: {} }
    const backing = store<{ payload: RawMediaState }>(
        id,
        { payload: { media: {} } },
        {
            autoStart: false,
            save: false,
            saveOnChange: false,
            saveOnExit: false,
            hooks: {
                beforeFrontendSync(state) {
                    // Root patches are merged by the plugin. Keeping the entire logical
                    // state under one stable key gives each commit replacement semantics.
                    loaded = Object.hasOwn(state, "payload") ? state.payload : state
                    return null
                },
                beforeBackendSync() {
                    return null
                },
                error(error) {
                    throw error
                },
            },
        },
    )
    // This controller owns writes. Library subscriptions cannot race explicit saves.
    // The library's patch is fire-and-forget and its instance saveNow aliases save;
    // await the same patch command and use the exported immediate saveNow instead.
    Lifecycle.onExit(() => stopExclusively(() => backing.stop()), true)
    return {
        read: () => loaded,
        async start() {
            await denySave(id)
            await backing.start()
        },
        async commit(state) {
            await invoke("plugin:valtio|patch", { id, state: { payload: state } })
            backing.state.payload = state
        },
        async saveNow() {
            // Unload saves unconditionally in tauri-store; keep saving denied
            // except for this explicit, serialized, validated write.
            await allowSave(id)
            try {
                await saveNow(id)
            } finally {
                await denySave(id)
            }
        },
        stop: () => backing.stop(),
    }
}

export interface RemovalDetails {
    id: string
    removed: boolean
    orphaned: boolean
}
export interface MediaCollection<K extends CollectionKey> {
    read(): Promise<StoredMedia[]>
    list(): Promise<StoredMedia[]>
    get(id: string): Promise<StoredMedia | undefined>
    has(id: string): Promise<boolean>
    add(media: Omit<StoredMedia, "collections">, facet: MediaCollectionData[K]): Promise<void>
    attach(id: string, facet: MediaCollectionData[K]): Promise<void>
    update(id: string, patch: Partial<MediaCollectionData[K]>): Promise<void>
    remove(id: string): Promise<RemovalDetails>
    pin(id: string): Promise<void>
    unpin(id: string): Promise<void>
    reconcilePins(): Promise<void>
    clearUnpinned(): Promise<RemovalDetails[]>
    clearAll(): Promise<RemovalDetails[]>
}

/** Factory is an injection seam for tests; application callers use mediaStore. */
export function createMediaStore(
    factory?: () => Promise<MediaBackingStore>,
    steps: readonly MediaMigration[] = mediaMigrations,
    context: MigrationContext = {},
) {
    const mutex = new Mutex()
    let loading: Promise<void> | undefined
    let backing: MediaBackingStore
    const state = proxy<MediaState>({ version: MEDIA_STORE_VERSION, media: {} })
    const collections = new Map<CollectionKey, unknown>()
    function replaceState(next: MediaState) {
        state.version = next.version
        state.media = next.media
    }
    function load(): Promise<void> {
        loading ??= mutex.runExclusive(async () => {
            backing = await (factory
                ? factory()
                : createBackingStore((stop) => mutex.runExclusive(stop)))
            await backing.start()
            const raw = backing.read()
            const next = await migrateMediaState(raw, steps, context)
            if (
                versionOf(raw) !== MEDIA_STORE_VERSION ||
                JSON.stringify(raw) !== JSON.stringify(next)
            ) {
                await backing.commit(next)
                await backing.saveNow()
            }
            replaceState(next)
        })
        return loading
    }
    async function read<T>(fn: (state: MediaState) => T): Promise<T> {
        await load()
        return mutex.runExclusive(() => fn(plainClone(state)))
    }
    async function mutate<T>(fn: (state: MediaState) => T): Promise<T> {
        await load()
        return mutex.runExclusive(async () => {
            const draft = plainClone(state)
            const result = fn(draft)
            const next = validateMediaState(draft)
            await backing.commit(next)
            await backing.saveNow()
            replaceState(next)
            return result
        })
    }
    function collection<K extends CollectionKey>(key: K): MediaCollection<K> {
        if (key !== "metadata" && key !== "compare") fail(`unknown collection ${key}`)
        const cached = collections.get(key)
        if (cached) return cached as MediaCollection<K>
        function item(s: MediaState, id: string) {
            if (!Object.hasOwn(s.media, id)) fail(`missing media ${id}`)
            return s.media[id]
        }
        function facet(s: MediaState, id: string) {
            const value = item(s, id).collections[key]
            if (!value) fail(`media ${id} is not in ${key}`)
            return value
        }
        function remove(s: MediaState, id: string): RemovalDetails {
            const value = Object.hasOwn(s.media, id) ? s.media[id] : undefined
            if (!value?.collections[key]) return { id, removed: false, orphaned: false }
            delete value.collections[key]
            const orphaned = Object.keys(value.collections).length === 0
            if (orphaned) delete s.media[id]
            return { id, removed: true, orphaned }
        }
        const list = () =>
            read((s) =>
                Object.values(s.media)
                    .filter((m) => m.collections[key])
                    .sort((a, b) => {
                        const added =
                            (a.collections[key]?.addedAt ?? 0) - (b.collections[key]?.addedAt ?? 0)
                        return added || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
                    }),
            )
        const api: MediaCollection<K> = {
            read: list,
            list,
            get: (id) =>
                read((s) =>
                    Object.hasOwn(s.media, id) && s.media[id].collections[key]
                        ? s.media[id]
                        : undefined,
                ),
            has: async (id) => (await api.get(id)) !== undefined,
            add: (media, data) =>
                mutate((s) => {
                    if (Object.hasOwn(s.media, media.id)) fail(`duplicate media ${media.id}`)
                    Object.defineProperty(s.media, media.id, {
                        value: { ...media, collections: { [key]: data } },
                        enumerable: true,
                        writable: true,
                        configurable: true,
                    })
                }),
            attach: (id, data) =>
                mutate((s) => {
                    const m = item(s, id)
                    if (m.collections[key]) fail(`media ${id} already belongs to ${key}`)
                    m.collections[key] = data
                }),
            update: (id, patch) =>
                mutate((s) => {
                    Object.assign(facet(s, id), patch)
                }),
            remove: (id) => mutate((s) => remove(s, id)),
            pin: (id) =>
                mutate((s) => {
                    const f = facet(s, id)
                    if (f.pin === undefined)
                        f.pin =
                            Object.values(s.media).filter(
                                (m) => m.collections[key]?.pin !== undefined,
                            ).length + 1
                }),
            unpin: (id) =>
                mutate((s) => {
                    delete facet(s, id).pin
                }),
            reconcilePins: () => mutate((s) => reconcile(s, key)),
            clearUnpinned: () =>
                mutate((s) =>
                    Object.values(s.media)
                        .filter((m) => m.collections[key] && m.collections[key]?.pin === undefined)
                        .map((m) => remove(s, m.id)),
                ),
            clearAll: () =>
                mutate((s) =>
                    Object.values(s.media)
                        .filter((m) => m.collections[key])
                        .map((m) => remove(s, m.id)),
                ),
        }
        collections.set(key, api)
        return api
    }
    return {
        load,
        state: state as ReactiveMediaState,
        subscribe: (callback: () => void, notifyInSync?: boolean) =>
            subscribeProxy(state, callback, notifyInSync),
        read: () => read((s) => s),
        collection,
    }
}

export const mediaStore = createMediaStore()
