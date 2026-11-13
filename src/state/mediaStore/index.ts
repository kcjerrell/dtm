import { invoke } from "@tauri-apps/api/core"
import { store as createStore } from "@tauri-store/valtio"
import { Mutex } from "async-mutex"
import { customAlphabet } from "nanoid"
import { proxy, snapshot } from "valtio"
import { batch } from "valtio-reactive"
import Lifecycle from "@/lifecycle"
import { clearArray, getStoreName } from "@/utils/helpers"
import { getCollections } from "./collections"
import { MediaStoreFiles } from "./files"
import {
    MediaItemAlreadyInCollectionError,
    type MediaItemSource,
    type MediaState,
    type MediaStateCol,
    type MediaStorage,
    type MediaStoreApi,
    type MediaStoreType,
    VALID_MEDIA_TYPES,
    VALID_VIDEO_TYPES,
} from "./types"

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12)

function getSourceKey(source: MediaItemSource | undefined) {
    if (source?.projectId != null && source.tensorId) {
        return `project:${JSON.stringify([source.projectId, source.tensorId])}`
    }
    if (source?.file) return `file:${source.file}`
    if (source?.url) {
        try {
            const url = new URL(source.url)
            if (url.protocol !== "https:" && url.protocol !== "http:") return
            url.hash = ""
            return `url:${url.href}`
        } catch {
            // Older items may have descriptive source strings instead of URLs.
        }
    }
}

function createMediaStore() {
    const tauriStore: ReturnType<typeof initStore> = initStore()
    const store = tauriStore.state
    const {
        promise: isReadyPromise,
        resolve: resolveReady,
        reject: rejectReady,
    } = Promise.withResolvers<boolean>()
    let isReady = false
    const pendingCleanup = new Set<Promise<void>>()
    const sourceLocks = new Map<string, Mutex>()

    function initStore() {
        const storeInstance = createStore<MediaStoreType>(
            getStoreName("media"),
            { items: [] as MediaStateCol[] },
            {
                autoStart: false,
                saveOnChange: true,
                saveOnExit: true,
            },
        )
        Lifecycle.onExit(async () => {
            // skip cleanup if exitting before store has finished loading
            if (!isReady) return

            await collections.onExit()
            await clearUnusedItems()
            const referencedFiles = new Set(
                store.items.flatMap((item) =>
                    item.storage.kind === "app" ? [item.storage.fname] : [],
                ),
            )
            await MediaStoreFiles.removeOrphanedFiles(referencedFiles)
        }, false)
        queueMicrotask(async () => {
            try {
                await storeInstance.start()
                console.debug("Media store started")
                resolveReady(true)
                isReady = true
            } catch (error) {
                rejectReady(error)
            }
        })
        return storeInstance
    }

    async function waitForReady() {
        await isReadyPromise
    }

    async function persist() {
        await waitForReady()
        // Send the current state and await the backend's immediate save in the same call.
        await invoke("plugin:valtio|patch", { id: tauriStore.id, state: snapshot(store) })
    }

    function getNewId() {
        const ids = store.items.map((item) => item.id)
        let id = nanoid()
        while (ids.includes(id)) id = nanoid()
        return id
    }

    async function withSourceLock<T>(key: string | undefined, action: () => Promise<T>) {
        if (!key) return await action()
        const mutex = sourceLocks.get(key) ?? new Mutex()
        sourceLocks.set(key, mutex)
        try {
            return await mutex.runExclusive(action)
        } finally {
            if (!mutex.isLocked() && sourceLocks.get(key) === mutex) sourceLocks.delete(key)
        }
    }

    function getSourceCandidates(key: string, collectionId: string, onlyInCollection = false) {
        return store.items
            .filter(
                (item) =>
                    (!onlyInCollection || collectionId in item.$col) &&
                    getSourceKey(item.source) === key,
            )
            .sort((a, b) => Number(collectionId in b.$col) - Number(collectionId in a.$col))
    }

    async function findMatchingSnapshot(
        fname: string,
        candidates: MediaStateCol[],
        excludeId?: string,
    ) {
        const snapshots = candidates.flatMap((item) =>
            item.id !== excludeId && item.storage.kind === "app"
                ? [{ item, fname: item.storage.fname }]
                : [],
        )
        while (snapshots.length) {
            const index = await MediaStoreFiles.findMatchingFile(
                fname,
                snapshots.map((snapshot) => snapshot.fname),
            )
            if (index == null) return
            const match = snapshots[index].item
            // A collection may have removed the matching item during the file comparison.
            if (getItem(match.id) === match) return match
            snapshots.splice(0, index + 1)
        }
    }

    function attachItem(item: MediaStateCol, collectionId: string, collectionData: Record<string, unknown>) {
        const alreadyPresent = collectionId in item.$col
        if (!alreadyPresent) item.$col[collectionId] = collectionData
        return { item: item.id, alreadyPresent }
    }

    /**
     * Internal. To save items to the media store, create a collection first.
     * Although it's possible to save items for multiple collections, it is not recommended.
     */
    async function save(
        kind: MediaStorage["kind"],
        data: Uint8Array | string,
        type: string,
        source: MediaState["source"],
        collectionId: string,
        collectionData: Record<string, unknown>,
    ) {
        await waitForReady()
        if (!data || data.length === 0) throw new Error("missing data")
        if (!type || !VALID_MEDIA_TYPES.includes(type)) throw new Error("invalid type")
        if (kind === "app" && VALID_VIDEO_TYPES.includes(type))
            throw new Error("videos must be referenced by file or URL")
        if (!collections.getCollection(collectionId))
            throw new Error(`unknown media collection: ${collectionId}`)

        if (kind === "dtp") throw new Error("project storage is not supported")
        if (kind === "file" && (typeof data !== "string" || !data.startsWith("/")))
            throw new Error("file storage requires an absolute path")
        if (kind === "url" && (typeof data !== "string" || !/^https?:\/\//i.test(data)))
            throw new Error("URL storage requires an HTTP(S) URL")
        if (kind === "app" && !(data instanceof Uint8Array))
            throw new Error("data must be a Uint8Array")
        const input = typeof data === "string" && kind !== "app" ? { kind, location: data } : data
        if (typeof input === "string") throw new Error("invalid snapshot source")
        const itemSource =
            input instanceof Uint8Array
                ? source
                : input.kind === "file"
                  ? { ...source, file: input.location, url: null }
                  : { ...source, file: null, url: input.location }
        const key = getSourceKey(itemSource)
        return await withSourceLock(key, async () => {
            const candidates = key ? getSourceCandidates(key, collectionId) : []
            const isProject = key?.startsWith("project:")
            if (isProject && candidates.length) {
                return attachItem(candidates[0], collectionId, collectionData)
            }

            const id = getNewId()
            function register({ fname, url }: { fname: string; url: string }) {
                const item: MediaStateCol = proxy({
                    id,
                    url,
                    thumbUrl: url,
                    type,
                    source: itemSource,
                    storage: { kind: "app", fname },
                    createdAt: Date.now(),
                    $col: { [collectionId]: collectionData },
                })
                store.items.push(item)
                return { item: id, alreadyPresent: false }
            }

            if (input instanceof Uint8Array && !candidates.length) {
                return register(await MediaStoreFiles.saveFile(id, input, type))
            }
            return await MediaStoreFiles.withSnapshot(id, input, type, async (file, retain) => {
                const match = await findMatchingSnapshot(file.fname, candidates)
                if (match) return attachItem(match, collectionId, collectionData)
                const result = register(file)
                retain()
                return result
            })
        })
    }

    function getItem(id: string) {
        return store.items.find((item) => item.id === id)
    }

    async function addExistingToCollection(
        id: string,
        collectionId: string,
        collectionData: Record<string, unknown>,
    ) {
        await waitForReady()
        const item = getItem(id)
        if (!item) throw new Error(`Item ${id} not found`)
        if (!collections.getCollection(collectionId))
            throw new Error(`unknown media collection: ${collectionId}`)

        const key = getSourceKey(item.source)
        return await withSourceLock(key, async () => {
            if (getItem(id) !== item) throw new Error(`Item ${id} not found`)
            if (collectionId in item.$col) throw new MediaItemAlreadyInCollectionError()
            if (key) {
                const candidates = getSourceCandidates(key, collectionId, true)
                const match = key.startsWith("project:")
                    ? candidates[0]
                    : item.storage.kind === "app"
                      ? await findMatchingSnapshot(item.storage.fname, candidates, id)
                      : undefined
                if (match) throw new MediaItemAlreadyInCollectionError()
            }
            if (getItem(id) !== item) throw new Error(`Item ${id} not found`)
            return attachItem(item, collectionId, collectionData).item
        })
    }

    /** Internal. Use the collection api to remove items from a collection */
    async function remove(ids: string[], collectionId: string) {
        await waitForReady()
        const removeIds = new Set(ids)

        await batch(async () => {
            for (const item of store.items) {
                if (removeIds.has(item.id)) delete item.$col[collectionId]
            }
            await clearUnusedItems()
        })
    }

    async function clear(collectionId: string) {
        await waitForReady()
        await batch(async () => {
            for (const item of store.items) {
                if (collectionId in item.$col) delete item.$col[collectionId]
            }
            await clearUnusedItems()
        })
    }

    /** Clear all media while preserving registered collections. */
    async function reset() {
        await waitForReady()
        await batch(async () => {
            for (const item of store.items) {
                for (const collectionId of Object.keys(item.$col)) delete item.$col[collectionId]
            }
            await clearUnusedItems()
        })
    }

    async function clearUnusedItems() {
        const keepItems = [] as MediaStateCol[]
        const clearItems = [] as MediaStateCol[]
        for (const item of store.items) {
            if (Object.keys(item.$col).length === 0) clearItems.push(item)
            else keepItems.push(item)
        }

        clearArray(store.items, keepItems)

        async function removeFiles() {
            const errors: unknown[] = []
            for (const item of clearItems) {
                try {
                    if (item.storage.kind === "app") {
                        await MediaStoreFiles.removeFile(item.storage.fname)
                    }
                } catch (e) {
                    console.error(e)
                    errors.push(e)
                }
            }
            if (errors.length) throw new AggregateError(errors, "Media cleanup failed")
        }

        const cleanup = removeFiles()
        pendingCleanup.add(cleanup)
        try {
            await Promise.all([...pendingCleanup])
        } finally {
            pendingCleanup.delete(cleanup)
        }
    }

    async function copyImageToClipboard(id: string) {
        await waitForReady()
        const item = getItem(id)
        if (!item) return

        switch (item.storage.kind) {
            case "app":
                await MediaStoreFiles.copyToClipboard(item.storage.fname)
                break
            case "file":
            case "url":
            case "dtp":
        }
    }

    async function saveCopy(id: string, dest: string) {
        await waitForReady()
        const item = getItem(id)
        if (!item) return
        if (item.storage.kind === "app") {
            await MediaStoreFiles.saveCopy(item.storage.fname, dest)
        } else if (item.storage.kind === "file") {
            await MediaStoreFiles.saveFileCopy(item.storage.path, dest)
        }
    }

    const api: MediaStoreApi = {
        save,
        remove,
        clear,
        waitForReady,
        addExistingToCollection,
    }

    const collections = getCollections(store, api)
    const { defineCollection, useCollection, getCollection } = collections

    return {
        defineCollection,
        getCollection,
        useCollection,
        waitForReady,
        persist,
        reset,
        copyImageToClipboard,
        saveCopy,
    }
}

const MediaStore = createMediaStore()
export default MediaStore
