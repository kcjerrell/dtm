import * as path from "@tauri-apps/api/path"
import * as fs from "@tauri-apps/plugin-fs"
import { store as createStore } from "@tauri-store/valtio"
import { proxy } from "valtio"
import { computed } from "valtio-reactive"
import { loadMediaFromFile, loadMediaFromUrl } from "@/metadata/state/imageLoaders"
import MediaStore from "@/state/mediaStore"
import type { MediaCollection } from "@/state/mediaStore/collections"
import {
    type MediaItemSource,
    VALID_IMAGE_TYPES,
    VALID_VIDEO_TYPES,
} from "@/state/mediaStore/types"
import { getSetting } from "@/state/settings"
import { getStoreName } from "@/utils/helpers"
import { bindProxy } from "@/utils/valtio"
import { MdImage } from "./MdImage"
import type MdItem from "./MdItem"
import { MdVideo } from "./MdVideo"

type MetadataStore = {
    state: {
        isLoadingImage: boolean
        currentItem?: MdItem
        settings: {
            clearHistoryOnExit: boolean
            clearPinsOnExit: boolean
        }
        items: MdItem[]
    }
    collection: MediaCollection<{ pin: number | null }, MdItem>
    selectImage: (id: string | null) => void
    clearAll: (keepPins?: boolean) => void
    addItem: (data: Uint8Array, type: string, source: MediaItemSource) => Promise<void>
    addMediaFromFile: (file: string, source?: MediaItemSource) => Promise<void>
    addMediaFromUrl: (url: string, source?: MediaItemSource) => Promise<void>

    pinImage(useCurrent: true, pin: boolean): void
    pinImage(image: MdItem, pin: boolean): void
}

let _mdStore: MetadataStore

const getPin = (item: { pin?: number | null }) => item.pin
const getId = (item: { id: string }) => item.id

type LegacyMetadataItem = {
    id?: unknown
    type?: unknown
    source?: unknown
    pin?: unknown
}

type LegacyMetadataStore = {
    items: LegacyMetadataItem[]
}

function getLegacySource(source: unknown): MediaItemSource {
    if (typeof source !== "object" || source === null || Array.isArray(source)) return {}
    return source as MediaItemSource
}

async function migrateLegacyMetadata(collection: MetadataStore["collection"]) {
    const legacyStore = createStore<LegacyMetadataStore>(
        getStoreName("metadata"),
        { items: [] },
        { autoStart: false },
    )

    try {
        await legacyStore.start()
        const appDataDir = await path.appDataDir()
        const imageStoreFolder = await path.join(appDataDir, getStoreName("images"))
        for (const legacyItem of legacyStore.state.items) {
            if (typeof legacyItem.id !== "string" || typeof legacyItem.type !== "string") continue

            const source = getLegacySource(legacyItem.source)
            const pin = typeof legacyItem.pin === "number" ? legacyItem.pin : null
            try {
                let item: MdItem | undefined
                if (VALID_IMAGE_TYPES.includes(legacyItem.type)) {
                    const imagePath = await path.join(
                        imageStoreFolder,
                        `${legacyItem.id}.${legacyItem.type}`,
                    )
                    if ((await path.dirname(imagePath)) !== imageStoreFolder) {
                        console.warn("skipping legacy image outside the image store", legacyItem.id)
                        continue
                    }
                    item = await collection.addMediaFromFile(imagePath, source)
                    if (item) {
                        try {
                            await fs.remove(imagePath)
                        } catch (error) {
                            console.warn("failed to remove migrated legacy image", imagePath, error)
                        }
                    }
                } else if (VALID_VIDEO_TYPES.includes(legacyItem.type)) {
                    const location = source.file ?? source.url
                    const media =
                        typeof location !== "string"
                            ? undefined
                            : source.file
                              ? await loadMediaFromFile(location, source)
                              : await loadMediaFromUrl(location, source)
                    if (media) item = await collection.addMedia(media)
                }

                if (item) item.cState.pin = pin && pin > 0 ? 1 : null
            } catch (error) {
                console.warn("failed to migrate legacy metadata item", legacyItem.id, error)
            }
        }
    } finally {
        await legacyStore.stop()
    }
}

function getStore() {
    if (!_mdStore) {
        _mdStore = initStore()
    }
    return _mdStore
}

function initStore(): MetadataStore {
    console.log("initstore md")
    const collection = MediaStore.defineCollection<{ pin: number | null }, MdItem>(
        "metadata",
        { pin: null as number | null },
        {
            itemFactory: (item, state) => {
                let mdItem: MdItem | undefined
                if (VALID_IMAGE_TYPES.includes(item.type)) mdItem = new MdImage(item, state)
                else if (VALID_VIDEO_TYPES.includes(item.type)) mdItem = new MdVideo(item, state)
                if (!mdItem) throw new Error(`Invalid item type: ${item.type}`)

                return bindProxy(proxy(mdItem))
            },
            onItemsChanged: () => {
                const state = getStore().state
                if (state.currentItem && !state.items.includes(state.currentItem)) {
                    state.currentItem = undefined
                }
            },
            getPersistIds: () => {
                const state = getStore().state
                if (!state.settings.clearHistoryOnExit) return state.items.map(getId)
                if (state.settings.clearPinsOnExit) return []
                return state.items.filter(getPin).map(getId)
            },
            version: 1,
            postMigrate: async () => {
                await migrateLegacyMetadata(collection)
                reconcilePins()
            },
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
        get items() {
            return collection.items
        },
    })

    function selectImage(id: string | null) {
        const item = id ? collection.getItemById(id) : undefined
        state.currentItem = item
    }

    function clearAll(keepPins?: boolean) {
        if (keepPins) {
            const ids = collection.items.filter((item) => !item.pin).map((item) => item.id)
            collection.removeItems(ids)
        } else {
            collection.clear()
        }
    }

    async function addItem(data: Uint8Array, type: string, source: MediaItemSource) {
        const item = await collection.addItem(data, type, source)
        if (item) selectImage(item.id)
    }

    async function addMediaFromFile(file: string, source?: MediaItemSource) {
        const item = await collection.addMediaFromFile(file, source)
        if (item) selectImage(item.id)
    }

    async function addMediaFromUrl(url: string, source?: MediaItemSource) {
        const item = await collection.addMediaFromUrl(url, source)
        if (item) selectImage(item.id)
    }

    function pinImage(useCurrent: true, pin: boolean): void
    function pinImage(item: MdItem, pin: boolean): void
    function pinImage(arg: true | MdItem, pin: boolean): void {
        const item = arg === true ? state.currentItem : arg
        if (item) item.cState.pin = pin ? Number.POSITIVE_INFINITY : null
        reconcilePins()
    }

    function reconcilePins() {
        const pinned = collection.items.filter((item) => item.pin !== null)
        pinned.sort((a, b) => (a.pin ?? 0) - (b.pin ?? 0))
        pinned.forEach((item, index) => {
            item.cState.pin = index + 1
        })
    }

    return {
        state,
        collection,
        selectImage,
        clearAll,
        addItem,
        addMediaFromFile,
        addMediaFromUrl,
        pinImage,
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
