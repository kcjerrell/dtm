export type DtProjectStorage = {
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
    | { kind: "dtm"; id: string }
    // for local files
    | { kind: "file"; path: string }
    // for remote files
    | { kind: "url"; url: string }
    // for resources in a dt project
    | DtProjectStorage

export interface MediaSource extends Record<string, unknown> {
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
    source: MediaSource
    storage: MediaStorage
    createdAt: number
    $col: Record<string, object>
}

export type MediaStoreType = {
    version: number
    items: MediaState[]
    collections: Record<string, CollectionState>
}

export type CollectionState<
    T extends Record<string, unknown> = Record<string, unknown>,
    F extends object = CollectionItem<T>,
> = {
    id: string
    items: F[]
}

export type CollectionItem<T extends Record<string, unknown> = Record<string, unknown>> = Omit<
    MediaState,
    "$col"
> &
    T

export type UseCreateCollectionOptions<T extends Record<string, unknown>, F = unknown> = {
    itemFactory?: MediaCollectionItemFactory<T, F>
}

export type MediaCollectionItemFactory<
    T extends Record<string, unknown> = Record<string, unknown>,
    F = unknown,
> = (item: MediaState, getState: () => T, setState: (state: Partial<T>) => void) => F
