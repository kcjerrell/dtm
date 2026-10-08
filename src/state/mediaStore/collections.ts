import { type Snapshot, useSnapshot } from "valtio"
import { effect } from "valtio-reactive"
import {
    type LoadedMedia,
    loadImageFromDtp,
    loadImageFromFile,
    loadImageFromPasteboard,
    loadImageFromPose,
    loadImageFromUrl,
    loadMediaFromFile,
    loadMediaFromPasteboard,
    loadMediaFromUrl,
} from "@/metadata/state/imageLoaders"
import { getItemFactory, type MediaItemBase } from "./MediaItem"
import type {
    CollectionItem,
    UseCreateCollectionOptions as CollectionOptions,
    MediaItemSource,
    MediaStoreApi,
    MediaStoreType,
} from "./types"

export function getCollections(
    store: MediaStoreType,
    api: MediaStoreApi,
    collectionOpts: Record<
        string,
        CollectionOptions<Record<string, unknown>, MediaItemBase<Record<string, unknown>>>
    >,
) {
    function defineCollection<
        T extends Record<string, unknown>,
        F extends MediaItemBase<T> = CollectionItem<T>,
    >(
        collectionId: string,
        defaultValue: T,
        opts: CollectionOptions<T, F> = {},
    ): MediaCollection<T, F> {
        console.debug("defineCollection", collectionId)
        if (collectionId in store.collections) {
            throw new Error("collectionId already in store.collections")
        }
        if (collectionId in collectionOpts) {
            throw new Error("collectionId already in collectionOpts")
        }

        const cOpts = { ...opts }
        cOpts.itemFactory ??= getItemFactory(collectionId, defaultValue) as unknown as NonNullable<
            CollectionOptions<T, F>["itemFactory"]
        >
        const onItemsChanged = cOpts.onItemsChanged

        store.collections[collectionId] = {
            id: collectionId,
            items: [],
        }

        collectionOpts[collectionId] = cOpts as CollectionOptions<
            Record<string, unknown>,
            MediaItemBase<Record<string, unknown>>
        >

        const collection = new MediaCollection<T, F>(collectionId, defaultValue, store, api)

        if (onItemsChanged) {
            let onItemsChangedScheduled = false
            let lastLength = 0
            effect(() => {
                const length = store.collections[collectionId].items.length
                if (length === lastLength) return
                lastLength = length
                if (!onItemsChangedScheduled) {
                    onItemsChangedScheduled = true
                    queueMicrotask(() => {
                        onItemsChangedScheduled = false
                        onItemsChanged()
                    })
                }
            })
        }

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

export class MediaCollection<
    T extends Record<string, unknown>,
    F extends MediaItemBase<T> = CollectionItem<T>,
> {
    constructor(
        public readonly collectionId: string,
        private readonly defaultItemState: T,
        private readonly store: MediaStoreType,
        private readonly storeApi: MediaStoreApi,
    ) {
        // runs in microtask so to ensure initialization is complete before callbacks are called
        queueMicrotask(() => this.storeApi.syncCollectionItems(this.collectionId))
    }

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
        return this.addStoredItem("app", data, type, source, state)
    }

    async addMedia(item: LoadedMedia, state?: T) {
        if ("kind" in item) {
            return this.addStoredItem(item.kind, item.location, item.type, item.source ?? {}, state)
        }
        return this.addItem(item.buffer, item.type, item.source ?? {}, state)
    }

    private async addStoredItem(
        kind: "app" | "file" | "url",
        data: Uint8Array | string,
        type: string,
        source: MediaItemSource,
        state?: T,
    ) {
        const itemState = state ?? structuredClone(this.defaultItemState)
        const id = await this.storeApi.save(kind, data, type, source, {
            [this.collectionId]: itemState,
        })
        return this.items.find((it) => it.id === id)
    }

    async addMediaFromFile(file: string, source?: MediaItemSource, state?: T) {
        const media = await loadMediaFromFile(file, source)
        if (media) return this.addMedia(media, state)
    }

    async addMediaFromUrl(url: string, source?: MediaItemSource, state?: T) {
        const media = await loadMediaFromUrl(url, source)
        if (media) return this.addMedia(media, state)
    }

    async addMediaFromPasteboard(pasteboard: "general" | "drag", state?: T): Promise<F[]> {
        const items: F[] = []
        for (const media of await loadMediaFromPasteboard(pasteboard)) {
            const item = await this.addMedia(media, state)
            if (item) items.push(item)
        }
        return items
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

    async addImageFromFile(
        file: string,
        source?: MediaItemSource,
        state?: T,
    ): Promise<F | undefined> {
        const image = await loadImageFromFile(file, source)
        if (image) return this.addItem(image.buffer, image.type, image.source ?? {}, state)
    }

    async addImageFromUrl(
        url: string,
        source?: MediaItemSource,
        state?: T,
    ): Promise<F | undefined> {
        const image = await loadImageFromUrl(url, source)
        if (image) return this.addItem(image.buffer, image.type, image.source ?? {}, state)
    }

    async addImageFromDtp(projectId: number, imageId: number, state?: T): Promise<F | undefined> {
        const image = await loadImageFromDtp(projectId, imageId)
        if (image) return this.addItem(image.buffer, image.type, image.source ?? {}, state)
    }

    async addImageFromPose(
        data: string,
        source?: MediaItemSource,
        state?: T,
    ): Promise<F | undefined> {
        const image = await loadImageFromPose(data, source)
        if (image) return this.addItem(image.buffer, image.type, image.source ?? {}, state)
    }

    async addImageFromPasteboard(pasteboard: "general" | "drag", state?: T): Promise<F[]> {
        const items: F[] = []
        for (const image of await loadImageFromPasteboard(pasteboard)) {
            const item = await this.addItem(image.buffer, image.type, image.source ?? {}, state)
            if (item) items.push(item)
        }
        return items
    }
}
