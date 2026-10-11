import { snapshot } from "valtio"
import type { CollectionItem, MediaCollectionItemFactory, MediaState, MediaStateCol } from "./types"

export class MediaItemBase<T = Record<string, unknown>> implements MediaState {
    private mState: MediaStateCol
    cState: T

    constructor(mState: MediaState, cState: T) {
        this.mState = mState as MediaStateCol
        this.cState = cState
    }

    get id() {
        return this.mState.id
    }

    get type() {
        return this.mState.type
    }

    get source() {
        return this.mState.source
    }

    get storage() {
        return this.mState.storage
    }

    get createdAt() {
        return this.mState.createdAt
    }

    get url() {
        return this.mState.url
    }

    get thumbUrl() {
        return this.mState.thumbUrl
    }

    get clearOnExit(): boolean {
        return false
    }

    async copyImageToClipboard() {
        const mdStore = (await import("./index")).default
        await mdStore.copyImageToClipboard(this.id)
    }

    async saveCopy(destPath: string) {
        const mdStore = (await import("./index")).default
        await mdStore.saveCopy(this.id, destPath)
    }

    // this might not actually work
    useSnap() {
        return snapshot(this)
    }
}

export function getItemFactory<T extends Record<string, unknown>>(
    collectionId: string,
    defaultValue: T,
): MediaCollectionItemFactory<T, CollectionItem<T>> {
    class Item extends MediaItemBase<T> {
        collectionId = collectionId
    }

    for (const key of Object.keys(defaultValue) as (keyof T)[]) {
        Object.defineProperty(Item.prototype, key, {
            enumerable: true,
            configurable: false,
            get() {
                return this.cState[key]
            },
            set(value) {
                this.cState[key] = value
            },
        })
    }

    return (source, state) => new Item(source, state) as unknown as CollectionItem<T>
}
