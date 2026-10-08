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
    version: number
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
        colData: MediaStateCol["$col"],
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
}

export type CollectionItem<T extends Record<string, unknown> = Record<string, unknown>> =
    MediaItemBase<T> & T

export type UseCreateCollectionOptions<
    T extends Record<string, unknown> = Record<string, unknown>,
    F extends MediaItemBase<T> = CollectionItem<T>,
> = {
    itemFactory?: MediaCollectionItemFactory<T, F>
    onItemsChanged?: () => void
    getPersistIds?: () => string[]
}

export type MediaCollectionItemFactory<
    T extends Record<string, unknown> = Record<string, unknown>,
    F extends MediaItemBase<T> = CollectionItem<T>,
> = (source: MediaState, state: T) => F
