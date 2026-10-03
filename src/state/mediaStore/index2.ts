import { Mutex } from "async-mutex"
import { MediaStoreType, MediaState, CollectionState, UseCreateCollectionOptions, CollectionItem, MediaCollectionItemFactory } from "./types"
import { store as createStore } from "@tauri-store/valtio"
import { getStoreName } from "@/utils/helpers"
import Lifecycle from "@/lifecycle"
import { useCallback, useEffect, useMemo } from "react"
import { getItemFactory } from "./MediaItem"
import { useProxyRefState } from "@/hooks/valtioHooks"

function createMediaStore() {
    const tauriStore: ReturnType<typeof initStore> = initStore()
    const store = tauriStore.state

    const updateColsCallbacks = {} as Record<string, () => void>

    function initStore() {
        const storeInstance = createStore<MediaStoreType>(
            getStoreName("media"),
            { version: 1, items: [] as MediaState[], collections: {} },
            {
                autoStart: true,
                syncStrategy: "debounce",
                syncInterval: 1000,
                saveOnChange: true,
                filterKeys: ["views"],
                filterKeysStrategy: "omit",
            },
        )
        Lifecycle.onExit(() => storeInstance.stop(), true)
        return storeInstance
    }

    /**
     * defaultValue must be a stable reference
     * opts.itemFactory must be a stable reference
     *
     */
    function useCreateCollection<T extends Record<string, unknown>>(
        collectionId: string,
        defaultValue: T,
    ): CollectionState<T, CollectionItem<T>>

    function useCreateCollection<T extends Record<string, unknown>, F extends object>(
        collectionId: string,
        defaultValue: T,
        opts: {
            itemFactory: MediaCollectionItemFactory<T, F>
        },
    ): CollectionState<T, F>
    function useCreateCollection<T extends Record<string, unknown>, F>(
        collectionId: string,
        defaultValue: T,
        opts?: UseCreateCollectionOptions<T, F>,
    ): CollectionState<T> {
        const { itemFactory: optsItemFactory } = opts ?? {}

        const itemFactory = useMemo(() => {
            console.log("getItemFactory", collectionId)
            if (optsItemFactory) return optsItemFactory
            return getItemFactory(collectionId, defaultValue) as MediaCollectionItemFactory<T, CollectionItem<T>
        }, [collectionId, defaultValue, optsItemFactory])

        const getItems = useCallback(() => {
            console.log("getItems", collectionId)
            return store.items
                .filter((item) => collectionId in item.$col)
                .map((item) =>
                    itemFactory(
                        item,
                        () => item.$col[collectionId] as T,
                        (state: Partial<T>) => {
                            if (!item.$col[collectionId]) {
                                item.$col[collectionId] = { ...defaultValue }
                            }
                            for (const key in state) {
                                item.$col[collectionId][key] = state[key]
                            }
                        },
                    ),
                )
        }, [itemFactory, collectionId, defaultValue])

        const collectionState: CollectionState<T, F> = useProxyRefState(() => ({
            id: collectionId,
            items: getItems(),
        }))

        useEffect(() => {
            console.log("subscribing", collectionId)

            if (collectionId in store.collections) {
                throw new Error("collectionId already in store.collections")
            }
            store.collections[collectionId] = collectionState

            if (collectionId in updateColsCallbacks) {
                throw new Error("collectionId already in updateCollections")
            }
            updateColsCallbacks[collectionId] = () => {
                collectionState.items = getItems()
            }

            return () => {
                console.log("unsubscribing", collectionId)
                delete store.collections[collectionId]
                delete updateColsCallbacks[collectionId]
            }
        }, [collectionState, getItems, collectionId])

        return collectionState
    }

    function useCollection(collectionId: string) {
        if (collectionId in store.collections) {
            return store.collections[collectionId]
        }
        return null
    }

    return {
        useCreateCollection,
        useCollection,
    }
}

const MediaStore = createMediaStore()
export default MediaStore
