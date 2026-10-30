import { convertFileSrc } from "@tauri-apps/api/core"
import { store as createStore } from "@tauri-store/valtio"
import { customAlphabet } from "nanoid"
import { proxy } from "valtio"
import { batch } from "valtio-reactive"
import Lifecycle from "@/lifecycle"
import { clearArray, getStoreName } from "@/utils/helpers"
import { getCollections } from "./collections"
import { MediaStoreFiles } from "./files"
import {
    type MediaState,
    type MediaStateCol,
    type MediaStorage,
    type MediaStoreApi,
    type MediaStoreType,
    VALID_MEDIA_TYPES,
    VALID_VIDEO_TYPES,
} from "./types"

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12)

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

    function getNewId() {
        const ids = store.items.map((item) => item.id)
        let id = nanoid()
        while (ids.includes(id)) id = nanoid()
        return id
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
        if (VALID_VIDEO_TYPES.includes(type) && kind !== "file" && kind !== "url")
            throw new Error("videos must be referenced by file or URL")
        if (!collections.getCollection(collectionId))
            throw new Error(`unknown media collection: ${collectionId}`)

        const id = getNewId()
        let storage: MediaStorage
        let url: string

        switch (kind) {
            case "app": {
                if (!(data instanceof Uint8Array)) throw new Error("data must be a Uint8Array")

                const saved = await MediaStoreFiles.saveFile(id, data, type)
                storage = { kind, fname: saved.fname }
                url = saved.url
                break
            }
            case "file": {
                if (typeof data !== "string" || !data.startsWith("/"))
                    throw new Error("file storage requires an absolute path")
                storage = { kind, path: data }
                url = convertFileSrc(data)
                break
            }
            case "url": {
                if (typeof data !== "string" || !/^https?:\/\//i.test(data))
                    throw new Error("URL storage requires an HTTP(S) URL")
                storage = { kind, url: data }
                url = data
                break
            }
            case "dtp":
                throw new Error("not yet supported")
        }

        const item: MediaStateCol = proxy({
            id,
            url,
            thumbUrl: url,
            type,
            source,
            storage,
            createdAt: Date.now(),
            $col: { [collectionId]: collectionData },
        })

        store.items.push(item)
        return id
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

        if (collectionId in item.$col) {
            throw new Error("Item is already in collection")
        }
        item.$col[collectionId] = collectionData
        return id
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
        reset,
        copyImageToClipboard,
        saveCopy,
    }
}

const MediaStore = createMediaStore()
export default MediaStore
