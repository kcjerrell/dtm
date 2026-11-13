import * as path from "@tauri-apps/api/path"
import * as fs from "@tauri-apps/plugin-fs"
import { store as createStore } from "@tauri-store/valtio"
import { proxy } from "valtio"
import { computed } from "valtio-reactive"
import type { LoadedVideo } from "@/metadata/state/imageLoaders"
import MediaStore from "@/state/mediaStore"
import type { MediaCollection } from "@/state/mediaStore/collections"
import {
    type MediaItemSource,
    VALID_IMAGE_TYPES,
    VALID_VIDEO_TYPES,
} from "@/state/mediaStore/types"
import { getFlag, getSetting, updateFlag } from "@/state/settings"
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
    collection: MediaCollection<MdItem["cState"], MdItem>
    selectImage: (id: string | null) => void
    clearAll: (keepPins?: boolean) => Promise<void>
    addMediaFromFile: (file: string, source?: MediaItemSource) => Promise<void>
    addMediaFromUrl: (url: string, source?: MediaItemSource) => Promise<void>

    pinImage(useCurrent: true, pin: boolean): void
    pinImage(image: MdItem, pin: boolean): void
}

let _mdStore: MetadataStore
const migrationFlag = "mediastore_migration"

type LegacyMetadataItem = {
    id?: unknown
    type?: unknown
    source?: unknown
    pin?: unknown
    filePath?: unknown
    url?: unknown
}

function getLegacySource(source: unknown): MediaItemSource {
    if (typeof source !== "object" || source === null || Array.isArray(source)) return {}
    return source as MediaItemSource
}

async function readLegacyMetadata() {
    const legacyStore = createStore(
        getStoreName("metadata"),
        { items: [] as unknown[] },
        {
            autoStart: false,
            save: false,
            filterKeys: ["items"],
            filterKeysStrategy: "pick",
            hooks: {
                error(error) {
                    throw error
                },
            },
        },
    )

    try {
        await legacyStore.start()
        if (!Array.isArray(legacyStore.state.items)) {
            throw new Error("Invalid items in the legacy metadata store")
        }
        return legacyStore.state.items
    } finally {
        await legacyStore.stop()
    }
}

function getLegacyVideo(
    item: LegacyMetadataItem,
    type: string,
    source: MediaItemSource,
): LoadedVideo | undefined {
    // The release saves the local path separately from the asset URL and source metadata.
    for (const location of [item.filePath, source.file, source.url, item.url]) {
        if (typeof location !== "string") continue
        if (location.startsWith("/")) return { kind: "file", location, type, source }
        if (/^files?:\/\//i.test(location)) {
            const url = new URL(location.replace(/^files:/i, "file:"))
            return { kind: "file", location: decodeURIComponent(url.pathname), type, source }
        }
        if (/^https?:\/\//i.test(location)) return { kind: "url", location, type, source }
    }
}

async function migrateLegacyMetadata(collection: MetadataStore["collection"]) {
    const items = await readLegacyMetadata()
    if (!items.length) return

    const imageStoreFolder = await path.join(await path.appDataDir(), getStoreName("images"))
    const migratedIds = new Set(collection.items.map((item) => item.cState.legacyId))
    const errors: Error[] = []

    for (const entry of items) {
        if (typeof entry !== "object" || entry === null) continue
        const legacyItem = entry as LegacyMetadataItem
        const { id, type } = legacyItem
        // Legacy IDs were generated from a 12-character lowercase alphanumeric alphabet.
        if (typeof id !== "string" || !/^[0-9a-z]{12}$/.test(id) || typeof type !== "string") {
            console.warn("Skipping invalid legacy metadata entry", id)
            continue
        }
        if (migratedIds.has(id)) continue

        const source = getLegacySource(legacyItem.source)
        const pin = legacyItem.pin
        const state = {
            legacyId: id,
            pin: typeof pin === "number" && Number.isFinite(pin) && pin > 0 ? pin : null,
        }
        try {
            let item: MdItem | undefined
            if (VALID_IMAGE_TYPES.includes(type)) {
                const imagePath = await path.join(imageStoreFolder, `${id}.${type}`)
                if (!(await fs.exists(imagePath))) {
                    console.warn("Legacy image cache file is missing", imagePath)
                    continue
                }
                item = await collection.addItem(await fs.readFile(imagePath), type, source, state)
            } else if (VALID_VIDEO_TYPES.includes(type)) {
                const video = getLegacyVideo(legacyItem, type, source)
                if (!video) {
                    console.warn("Legacy video location is missing", id)
                    continue
                }
                item = await collection.addMedia(video, state)
            } else {
                console.warn("Skipping unsupported legacy metadata type", id, type)
                continue
            }

            if (!item) throw new Error("Imported item is unavailable")
            if (item.pin == null && state.pin != null) item.cState.pin = state.pin
            migratedIds.add(id)
        } catch (error) {
            errors.push(new Error(`Failed to migrate legacy metadata item ${id}`, { cause: error }))
        }
    }

    await MediaStore.persist()
    if (errors.length) {
        throw new AggregateError(errors, "Some legacy metadata items could not be imported")
    }
}

function getStore() {
    if (!_mdStore) {
        _mdStore = initStore()
    }
    return _mdStore
}

function initStore(): MetadataStore {
    const collection = MediaStore.defineCollection<MdItem["cState"], MdItem>(
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
            version: 1,
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

    async function clearAll(keepPins?: boolean) {
        await collection.waitForReady()
        if (keepPins) {
            const ids = collection.items.filter((item) => !item.pin).map((item) => item.id)
            await collection.removeItems(ids)
        } else {
            await collection.clear()
        }
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

    void collection
        .waitForReady()
        .then(async () => {
            if (getFlag(migrationFlag)) return
            await migrateLegacyMetadata(collection)
            updateFlag(migrationFlag)
        })
        .catch((error) => {
            console.error("Legacy metadata migration failed", error)
        })

    return {
        state,
        collection,
        selectImage,
        clearAll,
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
