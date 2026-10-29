import { useSyncExternalStore } from "react"
import { getVersion, proxy, type Snapshot, subscribe, useSnapshot } from "valtio"
import { computed, effect } from "valtio-reactive"
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
    CollectionOptions,
    MediaCollectionItemFactory,
    MediaItemSource,
    MediaStateCol,
    MediaStoreApi,
    MediaStoreType,
} from "./types"

export function getCollections(store: MediaStoreType, api: MediaStoreApi) {
    const collections = new Map<
        string,
        MediaCollection<Record<string, unknown>, MediaItemBase<Record<string, unknown>>>
    >()

    function defineCollection<
        T extends Record<string, unknown>,
        F extends MediaItemBase<T> = CollectionItem<T>,
    >(
        collectionId: string,
        defaultValue: T,
        opts: CollectionOptions<T, F> = {},
    ): MediaCollection<T, F> {
        if (collections.has(collectionId)) throw new Error("collectionId already registered")
        const collection = new MediaCollection(collectionId, defaultValue, store, api, { ...opts })
        collections.set(
            collectionId,
            collection as unknown as MediaCollection<Record<string, unknown>, MediaItemBase>,
        )
        return collection
    }

    function getCollection(collectionId: string) {
        return collections.get(collectionId) ?? null
    }

    async function onExit() {
        // Callbacks may update flags on items in other collections as well.
        for (const collection of collections.values()) await collection.runExitCallback()
        for (const collection of collections.values()) await collection.clearExitItems()
    }

    return {
        defineCollection,
        getCollection,
        useCollection: getCollection,
        onExit,
    }
}

export class MediaCollection<
    T extends Record<string, unknown>,
    F extends MediaItemBase<T> = CollectionItem<T>,
> {
    private readonly compItems: { items: F[] }
    private readonly itemMap: CollectionMap<T, F>
    private readonly runtime = proxy({ storeVersion: 0 })
    private readonly subscribeItems = (callback: () => void) => subscribe(this.compItems, callback)
    private readonly getItems = () => this.compItems.items

    constructor(
        public readonly collectionId: string,
        private readonly defaultItemState: T,
        store: MediaStoreType,
        private readonly storeApi: MediaStoreApi,
        private readonly options: CollectionOptions<T, F> = {},
    ) {
        const factory =
            options.itemFactory ??
            (getItemFactory(
                collectionId,
                defaultItemState,
            ) as unknown as MediaCollectionItemFactory<T, F>)
        this.itemMap = new CollectionMap(collectionId, factory)
        let mappedItems: F[] = []
        this.compItems = computed({
            items: () => {
                // Track structural identity even when a reorder has identical item data.
                void this.runtime.storeVersion
                const items = store.items
                    .filter((item) => collectionId in item.$col)
                    .map((item) => this.itemMap.getItem(item))
                    .filter((item): item is F => item !== undefined)
                if (
                    items.length !== mappedItems.length ||
                    items.some((item, i) => item !== mappedItems[i])
                )
                    mappedItems = items
                return mappedItems
            },
        })

        // valtio-reactive's nested comparisons can miss reordered proxies with equal data.
        // A native subscription ensures computation also tracks structural identity changes.
        subscribe(
            store,
            () => {
                this.runtime.storeVersion++
            },
            true,
        )

        this.observeItems()
    }

    private observeItems() {
        const onItemsChanged = this.options.onItemsChanged
        if (!onItemsChanged) return
        let previous: F[] = []
        let scheduled = false
        effect(() => {
            const items = this.compItems.items
            if (items.length === previous.length && items.every((item, i) => item === previous[i]))
                return
            previous = [...items]
            if (scheduled) return
            scheduled = true
            queueMicrotask(() => {
                scheduled = false
                onItemsChanged()
            })
        })
    }

    get items(): F[] {
        return this.compItems.items
    }

    /** Internal collection lifecycle coordination. */
    async runExitCallback() {
        await this.waitForReady()
        await this.options.onExit?.()
    }

    /** Internal. Inspect mapped-item policy here; the store only removes memberships. */
    async clearExitItems() {
        await this.waitForReady()
        const ids = this.items.filter((item) => item.clearOnExit).map((item) => item.id)
        if (ids.length) await this.storeApi.remove(ids, this.collectionId)
    }

    getItemById(id: string): F | undefined {
        return this.items.find((it) => it.id === id)
    }

    async addItem(data: Uint8Array, type: string, source: MediaItemSource, state?: T) {
        return await this.addStoredItem("app", data, type, source, state)
    }

    async addExisting(id: string, state?: T) {
        await this.waitForReady()
        const itemState = state ?? structuredClone(this.defaultItemState)
        await this.storeApi.addExistingToCollection(id, this.collectionId, itemState)
        return this.items.find((it) => it.id === id)
    }

    async addMedia(item: LoadedMedia, state?: T) {
        if ("kind" in item) {
            return await this.addStoredItem(
                item.kind,
                item.location,
                item.type,
                item.source ?? {},
                state,
            )
        }
        return await this.addItem(item.buffer, item.type, item.source ?? {}, state)
    }

    private async addStoredItem(
        kind: "app" | "file" | "url",
        data: Uint8Array | string,
        type: string,
        source: MediaItemSource,
        state?: T,
    ) {
        await this.waitForReady()
        const itemState = state ?? structuredClone(this.defaultItemState)
        const id = await this.storeApi.save(kind, data, type, source, this.collectionId, itemState)
        return this.items.find((it) => it.id === id)
    }

    async addMediaFromFile(file: string, source?: MediaItemSource, state?: T) {
        const media = await loadMediaFromFile(file, source)
        if (media) return await this.addMedia(media, state)
    }

    async addMediaFromUrl(url: string, source?: MediaItemSource, state?: T) {
        const media = await loadMediaFromUrl(url, source)
        if (media) return await this.addMedia(media, state)
    }

    async addMediaFromPasteboard(pasteboard: "general" | "drag", state?: T): Promise<F[]> {
        const items: F[] = []
        for (const media of await loadMediaFromPasteboard(pasteboard)) {
            const item = await this.addMedia(media, state)
            if (item) items.push(item)
        }
        return items
    }

    async removeItems(ids: string[]): Promise<void>
    async removeItems(id: string): Promise<void>
    async removeItems(arg: string | string[]): Promise<void> {
        await this.waitForReady()
        const ids = Array.isArray(arg) ? arg : [arg]
        await this.storeApi.remove(ids, this.collectionId)
    }

    async clear(): Promise<void> {
        await this.waitForReady()
        await this.storeApi.clear(this.collectionId)
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
        return useSyncExternalStore(this.subscribeItems, this.getItems, this.getItems)
    }

    /**
     * Use this to get an array of collection items that will trigger a re-render when
     * items are added or removed or when properties used by the filter function change.
     * Returned items are not snapshots and will not trigger a render on change unless
     * used with useSnapshot
     * @returns an array of collection items
     */
    useFilterMapItems(filterFn: (item: Snapshot<F>) => boolean): F[] {
        const items = this.useMapItems()
        const snap = useSnapshot(this.compItems)
        return items.filter((_, i) => filterFn(snap.items[i] as Snapshot<F>))
    }

    async addImageFromFile(
        file: string,
        source?: MediaItemSource,
        state?: T,
    ): Promise<F | undefined> {
        const image = await loadImageFromFile(file, source)
        if (image) return await this.addItem(image.buffer, image.type, image.source ?? {}, state)
    }

    async addImageFromUrl(
        url: string,
        source?: MediaItemSource,
        state?: T,
    ): Promise<F | undefined> {
        const image = await loadImageFromUrl(url, source)
        if (image) return await this.addItem(image.buffer, image.type, image.source ?? {}, state)
    }

    async addImageFromDtp(projectId: number, imageId: number, state?: T): Promise<F | undefined> {
        const image = await loadImageFromDtp(projectId, imageId)
        if (image) return await this.addItem(image.buffer, image.type, image.source ?? {}, state)
    }

    async addImageFromPose(
        data: string,
        source?: MediaItemSource,
        state?: T,
    ): Promise<F | undefined> {
        const image = await loadImageFromPose(data, source)
        if (image) return await this.addItem(image.buffer, image.type, image.source ?? {}, state)
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

class CollectionMap<
    T extends Record<string, unknown>,
    F extends MediaItemBase<T> = CollectionItem<T>,
> {
    private readonly map = new WeakMap<MediaStateCol, WeakMap<T, F>>()

    constructor(
        private readonly collectionId: string,
        private readonly factory: MediaCollectionItemFactory<T, F>,
    ) {}

    getItem(mediaState: MediaStateCol): F | undefined {
        const cState = mediaState.$col[this.collectionId] as T
        let states = this.map.get(mediaState)
        if (!states) {
            states = new WeakMap<T, F>()
            this.map.set(mediaState, states)
        }
        const existing = states.get(cState)
        if (existing) return existing

        try {
            const created = this.factory(mediaState, cState)
            const item = getVersion(created) === undefined ? proxy(created) : created
            states.set(cState, item)
            return item
        } catch (error) {
            console.error(`${this.collectionId} factory failed for ${mediaState.id}:`, error)
            return undefined
        }
    }
}
