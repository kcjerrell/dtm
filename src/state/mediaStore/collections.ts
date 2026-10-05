import { Snapshot, useSnapshot } from "valtio"
import { getItemFactory } from "./MediaItem"
import type {
    CollectionItem,
    CollectionState,
    MediaCollectionItemFactory,
    MediaItemSource,
    MediaStoreApi,
    MediaStoreType,
    UseCreateCollectionOptions,
} from "./types"

type Unsubscribe = () => void
type ItemFactories = Record<
    string,
    MediaCollectionItemFactory<Record<string, unknown>, { id: string }>
>

export function getCollections(
    store: MediaStoreType,
    api: MediaStoreApi,
    itemFactories: ItemFactories,
) {
    function defineCollection<T extends Record<string, unknown>>(
        collectionId: string,
        defaultValue: T,
        opts?: { itemFactory?: undefined },
    ): MediaCollection<T, CollectionItem<T>>

    function defineCollection<T extends Record<string, unknown>, F extends { id: string }>(
        collectionId: string,
        defaultValue: T,
        opts: {
            itemFactory: MediaCollectionItemFactory<T, F>
        },
    ): MediaCollection<T, F>
    function defineCollection<T extends Record<string, unknown>, F extends { id: string }>(
        collectionId: string,
        defaultValue: T,
        opts?: UseCreateCollectionOptions<T, F>,
    ): MediaCollection<T, CollectionItem<T>>
    function defineCollection<T extends Record<string, unknown>, F extends { id: string }>(
        collectionId: string,
        defaultValue: T,
        opts?: UseCreateCollectionOptions<T, F>,
    ): MediaCollection<T, CollectionItem<T> | F> {
        console.debug("defineCollection", collectionId)
        const itemFactory = opts?.itemFactory ?? getItemFactory(collectionId, defaultValue)

        const getItems = () =>
            store.items
                .filter((item) => collectionId in item.$col)
                .map((item) => itemFactory(item, item.$col[collectionId] as T))

        if (collectionId in store.collections) {
            console.debug(store.collections)
            throw new Error("collectionId already in store.collections")
        }
        if (collectionId in itemFactories) {
            throw new Error("collectionId already in itemFactories")
        }

        store.collections[collectionId] = {
            id: collectionId,
            items: getItems(),
        }

        itemFactories[collectionId] = itemFactory as MediaCollectionItemFactory<
            Record<string, unknown>,
            { id: string }
        >

        const unsub = () => {
            delete store.collections[collectionId]
            delete itemFactories[collectionId]
        }

        const collection = new MediaCollection<T, F>(collectionId, defaultValue, store, api)

        return collection
    }

    function getCollection(collectionId: string) {
        if (collectionId in store.collections) {
            return store.collections[collectionId]
        }
        return null
    }

    function useCollection(collectionId: string) {
        return getCollection(collectionId)
    }

    return {
        defineCollection,
        getCollection,
        useCollection,
    }
}

export class MediaCollection<T extends Record<string, unknown>, F extends { id: string }> {
    constructor(
        public readonly collectionId: string,
        private readonly defaultItemState: T,
        private readonly store: MediaStoreType,
        private readonly storeApi: MediaStoreApi,
    ) {}

    private get collectionState() {
        return this.store.collections[this.collectionId]
    }

    get items(): F[] {
        return this.collectionState.items as F[]
    }

    getItemById(id: string): F | undefined {
        return this.items.find((it) => it.id === id)
    }

    async addItem(data: Uint8Array, type: string, source: MediaItemSource, state?: T) {
        const itemState = state ?? structuredClone(this.defaultItemState)
        const $col = {
            [this.collectionId]: itemState,
        }
        const id = await this.storeApi.save("app", data, type, source, $col)

        return this.items.find((it) => it.id === id)
    }

    removeItems(ids: string[]): void
    removeItems(id: string): void
    removeItems(arg: string | string[]): void {
        const ids = Array.isArray(arg) ? arg : [arg]
        this.storeApi.remove(ids, this.collectionId)
    }

    clear(): void {
        this.storeApi.clear(this.collectionId)
    }

    async waitForReady(): Promise<void> {
        await this.storeApi.waitForReady()
    }

    /**
     * Use this to get an array of collection items that will trigger a re-render when
     * items are added or removed. Returned items are not snapshots and will not trigger
     * render on change unless used with useSnapshot
     * @returns an array of collection items
     */
    useMapItems(): F[] {
        const snap = useSnapshot(this.collectionState)
        const items = this.collectionState.items as F[]
        return Array.from({ length: snap.items.length }, (_, i) => items[i])
    }

    /**
     * Use this to get an array of collection items that will trigger a re-render when
     * items are added or removed or when properties used by the filter function change.
     * Returned items are not snapshots and will not trigger a render on change unless
     * used with useSnapshot
     * @returns an array of collection items
     */
    useFilterMapItems(filterFn: (item: Snapshot<F>) => boolean): F[] {
        const snap = useSnapshot(this.collectionState)
        const items = this.collectionState.items as F[]
        const itemsState = Array.from({ length: snap.items.length }, (_, i) => items[i])
        return itemsState.filter((_, i) => filterFn(snap.items[i] as Snapshot<F>))
    }

    async addImageFromFile(file: File, source: MediaItemSource, state?: T): Promise<void> {
        // todo
    }

    async addImageFromUrl(url: string, source: MediaItemSource, state?: T): Promise<void> {
        // todo
    }

    async addImageFromDtp(projectId: number, imageId: number, state?: T): Promise<void> {
        // todo
    }

    async addImageFromPose(data: string, source: MediaItemSource, state?: T): Promise<void> {
        // todo
    }

    async addImageFromPasteboard(pasteboard: "general" | "drag", state?: T): Promise<void> {
        // todo
    }
}
