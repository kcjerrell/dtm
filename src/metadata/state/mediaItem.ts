import type { DrawThingsMetaData, ImageSource } from "@/types"
import { isVideo } from "@/utils/imageStore"
import type { ExifType } from "./metadataStore"

export type MediaItemConstructorOpts = {
    id: string
    pin?: number | null
    loadedAt?: number
    source: ImageSource
    type: string
}

abstract class MediaItem {
    id: string
    pin?: number | null | undefined
    loadedAt: number
    source: ImageSource
    type: string

    constructor(opts: MediaItemConstructorOpts) {
        if (!opts.id) throw new Error("ImageItem must have an id")
        if (!opts.source) throw new Error("ImageItem must have a source")
        if (!opts.type) throw new Error("ImageItem must have a type")

        this.id = opts.id
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

    toJSON() {
        return {
            id: this.id,
            source: this.source,
            pin: this.pin,
            loadedAt: this.loadedAt,
            type: this.type,
        }
    }
}

export default MediaItem
