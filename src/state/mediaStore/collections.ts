import { useMemo } from "react"
import { getVersion, proxy, type Snapshot, useSnapshot } from "valtio"
import { proxySet } from "valtio/utils"
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
    MediaImportResult,
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

    private itemIds = proxySet() //new Set<string>()

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
        this.compItems = computed({
            items: () => {
                const mappedItems: F[] = []
                for (const item of store.items) {
                    if (!item.$col[collectionId]) continue

                    const mappedItem = this.itemMap.getItem(item)
                    if (!mappedItem) continue

                    mappedItems.push(mappedItem)
                }
                return mappedItems
            },
        })

        this.observeItems()
    }

    private observeItems() {
        const onItemsChanged = this.options.onItemsChanged ?? (() => void 0)
        // if (!onItemsChanged) return
        let scheduled = false
        effect(() => {
            let changed = false
            const lastIds = new Map([...this.itemIds.values()].map((v) => [v, false]))
            for (const item of this.compItems.items) {
                if (!lastIds.has(item.id)) {
                    changed = false
                    this.itemIds.add(item.id)
                }
                lastIds.set(item.id, true)
            }
            for (const [id, seen] of lastIds.entries()) {
                if (!seen) {
                    changed = true
                    this.itemIds.delete(id)
                }
            }
            if (!scheduled && changed) {
                scheduled = true
                queueMicrotask(() => {
                    scheduled = false
                    onItemsChanged()
                })
            }
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
        return (await this.importMedia({ buffer: data, type, source }, state)).item
    }

    async addExisting(id: string, state?: T) {
        await this.waitForReady()
        const itemState = structuredClone(state ?? this.defaultItemState)
        await this.storeApi.addExistingToCollection(id, this.collectionId, itemState)
        return this.items.find((it) => it.id === id)
    }

    async addMedia(item: LoadedMedia, state?: T) {
        return (await this.importMedia(item, state)).item
    }

    async importMedia(
        media: LoadedMedia,
        state?: T,
    ): Promise<MediaImportResult<F | undefined>> {
        await this.waitForReady()
        const itemState = state ?? structuredClone(this.defaultItemState)
        const { item: id, alreadyPresent } = await this.storeApi.save(
            "kind" in media ? media.kind : "app",
            "kind" in media ? media.location : media.buffer,
            media.type,
            media.source ?? {},
            this.collectionId,
            itemState,
        )
        return { item: this.getItemById(id), alreadyPresent }
    }

    async addMediaFromFile(file: string, source?: MediaItemSource, state?: T) {
        const media = await loadMediaFromFile(file, source)
        if (media) return await this.addMedia(media, state)
    }

    async addMediaFromUrl(url: string, source?: MediaItemSource, state?: T) {
        const media = await loadMediaFromUrl(url, source)
        if (media) return await this.addMedia(media, state)
    }

    async importMediaFromPasteboard(
        pasteboard: "general" | "drag",
        onError: (error: unknown) => void,
    ) {
        const results: MediaImportResult<F>[] = []
        for (const media of await loadMediaFromPasteboard(pasteboard, onError)) {
            try {
                const { item, alreadyPresent } = await this.importMedia(media)
                if (!item) throw new Error("The imported media is unavailable")
                results.push({ item, alreadyPresent })
            } catch (error) {
                onError(error)
            }
        }
        return results
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
    extSyncs = 0
    /**
     * Use this to get an array of collection items that will trigger a re-render when
     * items are added or removed. Returned items are not snapshots and will not trigger
     * render on change unless used with useSnapshot
     * @returns an array of collection items
     */
    useItemsState(): F[] {
        // return useSyncExternalStore(
        //     this.subscribeItems,
        //     () => {
        //         console.log("sync ext store", this.extSyncs++)
        //         return this.getItems()
        //     },
        //     this.getItems,
        // )
        // const compItems = this.compItems
        // const items = useSnapshot(compItems).items
        // return Array.from({ length: items.length }, (_, i) => compItems.items[i])
        // return useSnapshot(this.compItems).

        const ids = useSnapshot(this.itemIds)
        const items = useMemo(() => {
            console.log("useItemsState useMemo ran", this.collectionId)
            return Array.from({ length: ids.size }, (_, i) => this.compItems.items[i])
        }, [ids])

        return items
    }

    /**
     * Use this to get an array of collection items that will trigger a re-render when
     * items are added or removed or when properties used by the filter function change.
     * Returned items are not snapshots and will not trigger a render on change unless
     * used with useSnapshot
     * @returns an array of collection items
     */
    useFilterMapItems(filterFn: (item: Snapshot<F>) => boolean): F[] {
        const items = this.useItemsState()
        const snap = useSnapshot(this.compItems)
        return items.filter((_, i) => filterFn(snap.items[i] as Snapshot<F>))
    }

    useItemsSnap() {
        return useSnapshot(this.compItems).items
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
