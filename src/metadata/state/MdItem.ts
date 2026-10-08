import { MediaItemBase } from "@/state/mediaStore/MediaItem"
import { type MediaItemSource, type MediaState, VALID_VIDEO_TYPES } from "@/state/mediaStore/types"
import type { DrawThingsMetaData } from "@/types"
import type { ExifType } from "./imageMetadata"

export type MdItemConstructorOpts = {
    // when recreating an item from store, we will use the same id
    id?: string
    pin?: number | null
    loadedAt?: number
    source: MediaItemSource
    type: string
}

abstract class MdItem extends MediaItemBase<{ pin: number | null }> {
    constructor(item: MediaState, state: { pin: number | null }) {
        super(item, state)
        if (!item.source) throw new Error("MdItem must have a source")
        if (!item.type) throw new Error("MdItem must have a type")
    }

    get pin(): number | null {
        return this.cState.pin
    }

    get isVideo() {
        return VALID_VIDEO_TYPES.includes(this.type)
    }

    abstract get metadata(): ExifType | null | undefined
    abstract get dtData(): DrawThingsMetaData | null | undefined

    abstract hasMetadata(): Promise<boolean>

    toJSON() {
        return {
            id: this.id,
            source: this.source,
            pin: this.pin,
            loadedAt: this.createdAt,
            type: this.type,
        }
    }
}

export default MdItem
