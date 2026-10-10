import { convertFileSrc } from "@tauri-apps/api/core"
import { store as createStore } from "@tauri-store/valtio"
import { customAlphabet } from "nanoid"
import { proxy } from "valtio"
import Lifecycle from "@/lifecycle"
import { clearArray, getStoreName } from "@/utils/helpers"
import { getCollections } from "./collections"
import { MediaStoreFiles } from "./files"
import type { MediaItemBase } from "./MediaItem"
import {
    type CollectionOptions,
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

    const collectionOpts = {} as Record<
        string,
        CollectionOptions<Record<string, unknown>, MediaItemBase<Record<string, unknown>>>
    >

    function initStore() {
        const storeInstance = createStore<MediaStoreType>(
            getStoreName("media"),
            { version: { $store: 1 }, items: [] as MediaStateCol[], collections: {} },
            {
                autoStart: false,
                // syncStrategy: "debounce",
                // syncInterval: 1000,
                saveOnChange: true,
                filterKeys: ["collections"],
                filterKeysStrategy: "omit",
                saveOnExit: true,
            },
        )
        Lifecycle.onExit(async () => {
            const persistIds = {} as Record<string, Set<string>>
            const collectionIds = Object.keys(collectionOpts)
            for (const cId of collectionIds) {
                persistIds[cId] = new Set(collectionOpts[cId].getPersistIds?.())
            }
            for (const item of store.items) {
                for (const cId of Object.keys(item.$col)) {
                    // only data for collection that were actually loaded will be deleted
                    if (persistIds[cId] && !persistIds[cId].has(item.id)) {
                        delete item.$col[cId]
                    }
                }
            }
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
                isReady = true
                const collectionIds = Object.keys(store.collections)
                console.debug(
                    `Media store started (${collectionIds.length ? collectionIds.join(", ") : "no collections"})`,
                )
                resolveReady(true)
            } catch (error) {
                rejectReady(error)
                isReady = false
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
        while (id in ids) id = nanoid()
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
        if (!data || data.length === 0) throw new Error("missing data")
        if (!type || !VALID_MEDIA_TYPES.includes(type)) throw new Error("invalid type")
        if (VALID_VIDEO_TYPES.includes(type) && kind !== "file" && kind !== "url")
            throw new Error("videos must be referenced by file or URL")
        const collection = store.collections[collectionId]
        const factory = collectionOpts[collectionId]?.itemFactory
        if (!collection || !factory) throw new Error(`unknown media collection: ${collectionId}`)

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

        let collectionItem: MediaItemBase
        try {
            collectionItem = factory(item, item.$col[collectionId])
        } catch (error) {
            if (storage.kind === "app") await MediaStoreFiles.removeFile(storage.fname)
            throw error
        }
        store.items.push(item)
        collection.items.push(collectionItem)
        return id
    }

    function getItem(id: string) {
        return store.items.find((item) => item.id === id)
    }

    /** Internal. Use the collection api to remove items from a collection */
    function remove(ids: string[], collectionId: string) {
        const removeIds = new Set(ids)
        const keepIds = new Set()

        for (const item of store.items) {
            if (removeIds.has(item.id)) {
                delete item.$col[collectionId]
            }
            if (collectionId in item.$col) {
                keepIds.add(item.id)
            }
        }

        const keepItems = store.collections[collectionId].items.filter((item) =>
            keepIds.has(item.id),
        )

        clearArray(store.collections[collectionId].items, keepItems)
        clearUnusedItems()
    }

    function clear(collectionId: string) {
        for (const item of store.items) {
            if (collectionId in item.$col) {
                delete item.$col[collectionId]
            }
        }

        clearArray(store.collections[collectionId].items)

        clearUnusedItems()
    }

    function syncCollectionItems(collectionId: string) {
        if (!isReady) return

        const cState = store.collections[collectionId]
        const synced = [] as MediaItemBase[]
        const storeItems = store.items.filter((item) => collectionId in item.$col)
        const collectionItemMap = new Map(cState.items.map((item) => [item.id, item]))
        const factory = collectionOpts[collectionId]?.itemFactory
        if (!factory) return

        for (const storeItem of storeItems) {
            try {
                synced.push(
                    collectionItemMap.get(storeItem.id) ??
                        factory(storeItem, storeItem.$col[collectionId]),
                )
            } catch (e) {
                console.error(`${collectionId} factory failed for ${storeItem.id}:`, e)
            }
        }

        clearArray(cState.items, synced)

        cState.isReady = true
    }

    function clearUnusedItems() {
        const keepItems = [] as MediaStateCol[]
        const clearItems = [] as MediaStateCol[]
        for (const item of store.items) {
            if (Object.keys(item.$col).length === 0) clearItems.push(item)
            else keepItems.push(item)
        }

        clearArray(store.items, keepItems)

        const { promise, resolve, reject } = Promise.withResolvers<void>()

        queueMicrotask(async () => {
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
            if (errors.length) reject(errors)
            resolve()
        })

        return promise
    }

    async function copyImageToClipboard(id: string) {
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
        const item = getItem(id)
        if (!item) return
        if (item.storage.kind === "app") {
            await MediaStoreFiles.saveCopy(item.storage.fname, dest)
        } else if (item.storage.kind === "file") {
            await MediaStoreFiles.saveFileCopy(item.storage.path, dest)
        }
    }

    const api: MediaStoreApi = { save, remove, clear, waitForReady, syncCollectionItems }

    const { defineCollection, useCollection, getCollection } = getCollections(
        store,
        api,
        collectionOpts,
    )

    return {
        defineCollection,
        getCollection,
        useCollection,
        waitForReady,
        copyImageToClipboard,
        saveCopy,
    }
}

const MediaStore = createMediaStore()
export default MediaStore
