import type { DrawThingsMetaData, ImageSource } from "@/types"
import { isVideo } from "@/utils/imageStore"
import type { ExifType } from "./metadataStore"
import { TMap } from "@/utils/TMap"
import { determineType } from "@/utils/mediaTypes"

export type MediaItemConstructorOpts = {
    // id: string
    pin?: number | null
    loadedAt?: number
    source: MediaItemSource
    type: string
}

export interface MediaItemSource extends Record<string, unknown> {
    loadedFrom?: "clipboard" | "drop" | "open" | "dtp" | string
    uti?: string
}

abstract class MediaItem {
    id: string
    pin?: number | null | undefined
    loadedAt: number
    source: MediaItemSource
    type: string

    constructor(opts: MediaItemConstructorOpts) {
        // if (!opts.id) throw new Error("ImageItem must have an id")
        if (!opts.source) throw new Error("ImageItem must have a source")
        if (!opts.type) throw new Error("ImageItem must have a type")

        console.log("created media item from", opts.source)

        this.id = MediaItem.getId()
        this.pin = opts.pin
        this.loadedAt = opts.loadedAt ?? Date.now()
        this.source = opts.source
        this.type = opts.type
    }

    get isVideo() {
        return isVideo(this.type)
    }

    abstract get exif(): ExifType | null | undefined
    abstract get dtData(): DrawThingsMetaData | null | undefined
    abstract get thumbUrl(): string | undefined
    abstract get url(): string | undefined

    abstract hasMetadata(): Promise<boolean>

    static idCounter = 0
    protected static getId() {
        return (MediaItem.idCounter++).toString(16).padStart(4, "0")
    }

    toJSON() {
        return {
            source: this.source,
            pin: this.pin,
            loadedAt: this.loadedAt,
            type: this.type,
        }
    }
}

export default MediaItem
