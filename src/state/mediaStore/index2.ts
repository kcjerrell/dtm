import { store as createStore } from "@tauri-store/valtio"
import { customAlphabet } from "nanoid"
import { proxy } from "valtio"
import Lifecycle from "@/lifecycle"
import { getStoreName } from "@/utils/helpers"
import { getCollections } from "./collections"
import { removeFile, saveFile } from "./files"
import {
    type MediaCollectionItemFactory,
    type MediaState,
    type MediaStateCol,
    type MediaStorage,
    MediaStoreApi,
    type MediaStoreType,
    VALID_MEDIA_TYPES,
} from "./types"
import { batch } from "valtio-reactive"

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12)

function createMediaStore() {
    const tauriStore: ReturnType<typeof initStore> = initStore()
    const store = tauriStore.state
    const { promise: isReady, resolve: resolveReady } = Promise.withResolvers<boolean>()

    const itemFactories = {} as Record<
        string,
        MediaCollectionItemFactory<Record<string, unknown>, { id: string }>
    >

    function initStore() {
        const storeInstance = createStore<MediaStoreType>(
            getStoreName("media"),
            { version: 1, items: [] as MediaStateCol[], collections: {} },
            {
                autoStart: false,
                syncStrategy: "debounce",
                syncInterval: 1000,
                saveOnChange: true,
                filterKeys: ["collections"],
                filterKeysStrategy: "omit",
            },
        )
        Lifecycle.onExit(() => storeInstance.stop(), true)
        queueMicrotask(async () => {
            await storeInstance.start()
            resolveReady(true)
        })
        return storeInstance
    }

    async function waitForReady() {
        await isReady
    }

    function getNewId() {
        const ids = store.items.map((item) => item.id)
        let id = nanoid()
        while (id in ids) id = nanoid()
        return id
    }

    /**
     * Internal. To save items to the media store, create a collection first
     */
    async function save(
        kind: MediaStorage["kind"],
        data: Uint8Array | string,
        type: string,
        source: MediaState["source"],
        colData: MediaStateCol["$col"],
    ) {
        if (!data || data.length === 0) throw new Error("missing data")
        if (!type || !VALID_MEDIA_TYPES.includes(type)) throw new Error("invalid type")
        if (!colData || typeof colData !== "object" || Object.keys(colData).length === 0)
            throw new Error("cannot save media unless it belongs to a collection")

        const id = getNewId()

        switch (kind) {
            case "app": {
                if (!(data instanceof Uint8Array)) throw new Error("data must be a Uint8Array")

                const { fname, url } = await saveFile(id, data, type)

                const item: MediaStateCol = proxy({
                    id,
                    url,
                    thumbUrl: url,
                    type,
                    source,
                    storage: { kind, fname },
                    createdAt: Date.now(),
                    $col: colData,
                })

                store.items.push(item)

                for (const collectionId in colData) {
                    const collection = store.collections[collectionId]
                    const factory = itemFactories[collectionId]
                    if (collection && factory) {
                        const cItem = factory(item, item.$col[collectionId])
                        collection.items.push(cItem)
                    }
                }

                return id
            }
            case "file":
                throw new Error("not yet supported")
            case "url":
                throw new Error("not yet supported")
            case "dtp":
                throw new Error("not yet supported")
        }
    }

    /** Internal. Use the collection api to remove items from a collection */
    function remove(ids: string[], collectionId: string) {
        const removeIds = new Set(ids)

        // remove collection data from items
        for (const item of store.items) {
            if (removeIds.has(item.id)) {
                delete item.$col[collectionId]
            }
        }

        // get items still in collection
        const remainingItemIds = new Set(
            store.items.filter((item) => collectionId in item.$col).map((item) => item.id),
        )

        // reconcile collection view
        const keepItems = store.collections[collectionId].items.filter((item) =>
            remainingItemIds.has(item.id),
        )
        store.collections[collectionId].items.splice(
            0,
            store.collections[collectionId].items.length,
            ...keepItems,
        )

        clearUnusedItems()
    }

    function clear(collectionId: string) {
        for (const item of store.items) {
            if (collectionId in item.$col) {
                delete item.$col[collectionId]
            }
        }

        store.collections[collectionId].items.splice(
            0,
            store.collections[collectionId].items.length,
        )

        clearUnusedItems()
    }

    function clearUnusedItems() {
        const keepItems = [] as MediaStateCol[]
        const clearItems = [] as MediaStateCol[]
        for (const item of store.items) {
            if (Object.keys(item.$col).length === 0) clearItems.push(item)
            else keepItems.push(item)
        }

        store.items.splice(0, store.items.length, ...keepItems)

        setTimeout(async () => {
            for (const item of clearItems) {
                if (item.storage.kind === "app") {
                    await removeFile(item.storage.fname)
                }
            }
        }, 200)
    }

    const api: MediaStoreApi = { save, remove, clear, waitForReady }

    const { defineCollection, useCollection, getCollection } = getCollections(store, api, itemFactories)

    return {
        defineCollection,
        getCollection,
        useCollection,
        api,
        waitForReady
    }
}

const MediaStore = createMediaStore()
export default MediaStore
