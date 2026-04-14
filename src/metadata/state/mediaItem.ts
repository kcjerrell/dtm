import type { DrawThingsMetaData } from "@/types"
import { isVideo } from "@/utils/imageStore"
import type { ExifType } from "./metadataStore"
import { customAlphabet } from "nanoid"

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
    id: string
    pin?: number | null | undefined
    loadedAt: number
    source: MediaItemSource
    type: string
    $isBinding = false

    constructor(opts: MediaItemConstructorOpts) {
        if (!opts.source) throw new Error("ImageItem must have a source")
        if (!opts.type) throw new Error("ImageItem must have a type")

        this.id = MediaItem.getNewId(opts.id)
        this.pin = opts.pin
        this.loadedAt = opts.loadedAt ?? Date.now()
        this.source = { type: opts.type, ...opts.source }
        this.type = opts.type
    }

    get isVideo() {
        return isVideo(this.type)
    }

    abstract get metadata(): ExifType | null | undefined
    abstract get dtData(): DrawThingsMetaData | null | undefined
    abstract get thumbUrl(): string | undefined
    abstract get url(): string | undefined

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
        return new LoadingItem(opts)
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
