import { MediaCollection } from "./collections"
import type { MediaItemBase } from "./MediaItem"

export const VALID_IMAGE_TYPES = ["png", "tiff", "jpg", "webp"]
export const VALID_VIDEO_TYPES = ["mp4", "webm", "mov", "m4v"]
export const VALID_MEDIA_TYPES = [...VALID_IMAGE_TYPES, ...VALID_VIDEO_TYPES]

export type DtProjectStorage = {
    kind: "dtp"
    projectFile: string
    nodeId?: number
} & (
    | {
          tensorId?: string
      }
    | {
          previewId?: number
      }
)

export type MediaStorage =
    // for media saved in MediaStore, backed by a file in appdata/images
    | { kind: "app"; fname: string }
    // for local files
    | { kind: "file"; path: string }
    // for remote files
    | { kind: "url"; url: string }
    // for resources in a dt project
    | DtProjectStorage

export interface MediaItemSource extends Record<string, unknown> {
    loadedFrom?: string
    type?: string
    uti?: string | null
    url?: string | null
    file?: string | null
    projectFile?: string | null
    nodeId?: number | null
    tensorId?: string | null
}

export interface MediaState {
    id: string
    type: string
    url: string
    thumbUrl: string
    source: MediaItemSource
    storage: MediaStorage
    createdAt: number
}

export interface MediaStateCol extends MediaState {
    $col: Record<string, Record<string, unknown>>
}

export type MediaStoreType = {
    version: {
        $store: number
        [collectionId: string]: number | undefined
    }
    items: MediaStateCol[]
    collections: Record<
        string,
        CollectionState<Record<string, unknown>, MediaItemBase<Record<string, unknown>>>
    >
}

export type MediaStoreApi = {
    save: (
        kind: MediaStorage["kind"],
        data: Uint8Array | string,
        type: string,
        source: MediaState["source"],
        collectionId: string,
        collectionData: Record<string, unknown>,
    ) => Promise<string>
    remove: (ids: string[], collectionId: string) => void
    clear: (collectionId: string) => void
    waitForReady: () => Promise<void>
    syncCollectionItems: (collectionId: string) => void
}

export type CollectionState<
    T extends Record<string, unknown> = Record<string, unknown>,
    F extends MediaItemBase<T> = CollectionItem<T>,
> = {
    id: string
    items: F[]
    /** will be false until the collection's first sync */
    isReady: boolean
}

export type CollectionItem<T extends Record<string, unknown> = Record<string, unknown>> =
    MediaItemBase<T> & T

export type CollectionOptions<
    T extends Record<string, unknown> = Record<string, unknown>,
    F extends MediaItemBase<T> = CollectionItem<T>,
> = {
    itemFactory?: MediaCollectionItemFactory<T, F>
    onItemsChanged?: () => void
    getPersistIds?: () => string[]
    /**
     * The version number for the collection item's data type. If the provided value is different
     * than the stored value, migration callbacks will be called. The first time a collection is
     * created, the `from` value will be undefined.
     */
    version?: number
    /**
      This will be called when version number changes *before* the collection is populated. Item
      state can be mutated directly. The return value should contain the updated state for each
      item. If no changes are required, this will be `return items.map((item) => item.state)`
     * @param from The version number from the stored data. Will be undefined on first use
     * @param to The current version as specified
     * @param items An array of each collection items base media state and (outdated) collection
     * data
     * @returns Each item's state, updated for the current version.
     */
    onMigrate?: (
        from: number | undefined,
        to: number,
        items: { media: MediaState; state: unknown }[],
    ) => T[]
    /**
     * This will be called when version number changes *after* the collection is populated. Items
     * can be added/removed through the collection.
     * @param from The version number from the stored data. Will be undefined on first use
     * @param to The current version as specified
     * @param collection The media collection instance
     */
    postMigrate?: (
        from: number | undefined,
        to: number,
        collection: MediaCollection<T, F>,
    ) => void | Promise<void>
}

export type MediaCollectionItemFactory<
    T extends Record<string, unknown> = Record<string, unknown>,
    F extends MediaItemBase<T> = CollectionItem<T>,
> = (source: MediaState, state: T) => F
