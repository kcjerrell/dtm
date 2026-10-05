import { snapshot } from "valtio"
import type { CollectionItem, MediaCollectionItemFactory, MediaState, MediaStateCol } from "./types"

export class MediaItemBase implements MediaState {
    state: MediaStateCol

    constructor(state: MediaStateCol) {
        this.state = state
    }

    get id() {
        return this.state.id
    }

    get type() {
        return this.state.type
    }

    get source() {
        return this.state.source
    }

    get storage() {
        return this.state.storage
    }

    get createdAt() {
        return this.state.createdAt
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
    class Item extends MediaItemBase {
        collectionId = collectionId
    }

    for (const key of Object.keys(defaultValue) as (keyof T)[]) {
        Object.defineProperty(Item.prototype, key, {
            enumerable: true,
            configurable: false,
            get() {
                return this.state.$col[collectionId][key]
            },
            set(value) {
                this.state.$col[collectionId][key] = value
            },
        })
    }

    // The store passes the original item, including its internal collection data.
    return (source) => new Item(source as MediaStateCol) as unknown as CollectionItem<T>
}
