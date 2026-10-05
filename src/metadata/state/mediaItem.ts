import { customAlphabet } from "nanoid"
import type { MediaState } from "@/state/mediaStore/types"
import type { DrawThingsMetaData } from "@/types"
import { isVideo } from "@/utils/imageStore"
import type { ExifType } from "./metadataStore"

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12)

export type MediaItemConstructorOpts = {
    // when recreating an item from store, we will use the same id
    id?: string
    pin?: number | null
    loadedAt?: number
    source: MediaItemSource
    type: string
}

export interface MediaItemSource extends Record<string, unknown> {
    loadedFrom?: "clipboard" | "drop" | "open" | "project" | string
    type?: string
    uti?: string | null
    url?: string | null
    file?: string | null
    projectFile?: string | null
    nodeId?: number | null
    tensorId?: string | null
}

abstract class MediaItem {
    mediaItem: MediaState
    mdState: { pin: number }

    constructor(item: MediaState, state: { pin: number }) {
        if (!item.source) throw new Error("ImageItem must have a source")
        if (!item.type) throw new Error("ImageItem must have a type")

        this.mediaItem = item
        this.mdState = state
    }

    get id(): string {
        return this.mediaItem.id
    }
    get pin(): number | null {
        return this.mdState.pin
    }
    get loadedAt(): number {
        return this.mediaItem.createdAt
    }
    get source(): MediaItemSource {
        return this.mediaItem.source
    }
    get type(): string {
        return this.mediaItem.type
    }
    get url(): string {
        return this.mediaItem.url
    }
    get thumbUrl(): string {
        return this.mediaItem.thumbUrl
    }

    get isVideo() {
        return isVideo(this.type)
    }

    abstract get metadata(): ExifType | null | undefined
    abstract get dtData(): DrawThingsMetaData | null | undefined
    // abstract get thumbUrl(): string | undefined
    // abstract get url(): string | undefined

    abstract hasMetadata(): Promise<boolean>

    static usedIds = new Set<string>()
    protected static getNewId(restoreId?: string) {
        if (restoreId) {
            MediaItem.usedIds.add(restoreId)
            return restoreId
        }

        let id = nanoid()
        while (MediaItem.usedIds.has(id)) {
            id = nanoid()
        }
        MediaItem.usedIds.add(id)
        return id
    }

    toJSON() {
        return {
            id: this.id,
            source: this.source,
            pin: this.pin,
            loadedAt: this.loadedAt,
            type: this.type,
        }
    }

    static getPlaceholder(opts: MediaItemConstructorOpts) {
        throw new Error("remove")
    }
}

class LoadingItem extends MediaItem {
    get metadata(): ExifType | null | undefined {
        return null
    }
    get dtData(): DrawThingsMetaData | null | undefined {
        return null
    }
    get thumbUrl(): string | undefined {
        return undefined
    }
    get url(): string | undefined {
        return undefined
    }
    hasMetadata(): Promise<boolean> {
        return Promise.resolve(false)
    }
}

export default MediaItem
