import MediaStore from "@/state/mediaStore/index2"
import { VALID_IMAGE_TYPES, VALID_VIDEO_TYPES, MediaItemSource } from "@/state/mediaStore/types"
import { ImageItem } from "./ImageItem"
import { VideoItem } from "./VideoItem"
import MediaItem from "./mediaItem"
import { MediaCollection } from "@/state/mediaStore/collections"
import { proxy } from "valtio"
import { computed } from "valtio-reactive"
import { getSetting } from "@/state/settings"

type MetadataStore = {
    state: {
        isLoadingImage: boolean
        currentItem?: MediaItem
        settings: {
            clearHistoryOnExit: boolean
            clearPinsOnExit: boolean
        }
    }
    collection: MediaCollection<{ pin: number | null }, MediaItem>
    selectImage: (id: string) => void
    clearAll: (keepPins?: boolean) => void
    addItem: (data: Uint8Array, type: string, source: MediaItemSource) => Promise<void>
}

let _mdStore: MetadataStore

function getStore() {
    if (!_mdStore) {
        _mdStore = initStore()
    }
    return _mdStore
}

function initStore(): MetadataStore {
    const collection = MediaStore.defineCollection<{ pin: number | null }, MediaItem>(
        "metadata",
        { pin: null as number | null },
        {
            itemFactory: (item, state) =>
                VALID_IMAGE_TYPES.includes(item.type)
                    ? new ImageItem(item, state)
                    : VALID_VIDEO_TYPES.includes(item.type)
                      ? new VideoItem(item, state)
                      : undefined,
        },
    )

    const settings = computed({
        clearHistoryOnExit: () => getSetting("metadata.clearHistoryOnExit"),
        clearPinsOnExit: () => getSetting("metadata.clearPinsOnExit"),
    })

    const state: MetadataStore["state"] = proxy({
        settings,
        isLoadingImage: false,
        currentItem: undefined,
    })

    function selectImage(id: string) {
        const item = collection.getItemById(id)
        state.currentItem = item
    }

    function clearAll(keepPins?: boolean) {
        if (keepPins) {
            const ids = collection.items.filter((item) => item.pin).map((item) => item.id)
            collection.removeItems(ids)
        } else {
            collection.clear()
        }
    }

    async function addItem(data: Uint8Array, type: string, source: MediaItemSource) {
        await collection.addItem(data, type, source)
    }

    return {
        state,
        collection,
        selectImage,
        clearAll,
        addItem,
    }
}

export function useMetadataStore() {
    return getStore()
}

// yes this is the same thing, but eventually this will be deprecated in favor of the hook. Although this is async.
export async function getMetadataStore() {
    const store = getStore()
    await store.collection.waitForReady()
    return store
}
