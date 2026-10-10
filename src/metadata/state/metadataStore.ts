
import { store } from "@tauri-store/valtio"

import { proxy, subscribe } from "valtio"
import Lifecycle from "@/lifecycle"
import { getSetting } from "@/state/settings"
import { getStoreName } from "@/utils/helpers"
import ImageStore, { isVideo } from "@/utils/imageStore"
import { bindProxy } from "@/utils/valtio"
import { MdImage } from "./MdImage"
import MdItem from "./MdItem"
import { MdVideo } from "./MdVideo"

const storeReady = Promise.withResolvers<void>()
export function waitForMetadataStore() {
    getMetadataStore()
    return storeReady.promise
}

throw new Error("this module is deprecated")

const initialStoreValues = {
    items: [] as MdItem[],
    currentIndex: null as number | null,
    zoomPreview: false,
    showHistory: false,
    maxHistory: 10,
    isLoadingImage: false,
    isLoaded: false,
}

function initStore() {
    const storeInstance = store(
        getStoreName("metadata"),
        {
            ...initialStoreValues,
            get currentItem(): MdItem | undefined {
                const s = getMetadataStore()
                if (s.currentIndex === null) return undefined
                return s.items[s.currentIndex]
            },
        },
        {
            autoStart: true,
            filterKeys: [
                "currentItem",
                "currentIndex",
                "zoomPreview",
                "showHistory",
                "isLoadingImage",
                "isLoaded",
            ],
            filterKeysStrategy: "omit",
            saveOnChange: true,
            saveOnExit: true,
            saveStrategy: "debounce",
            syncStrategy: "throttle",
            saveInterval: 60000,
            syncInterval: 1000,

            hooks: {
                beforeFrontendSync(state) {
                    // when syncing state from the store, we need to make sure pojos become classes
                    if (typeof state !== "object" || state === null) return state

                    setTimeout(() => {
                        getStore().state.isLoaded = true
                    }, 0)

                    if ("items" in state && Array.isArray(state.items)) {
                        state.items = state.items.map(
                            (im: MdItem | ReturnType<MdItem["toJSON"]>) => {
                                if (im instanceof MdItem) return im

                                // we'll create a placeholder for the item
                                const placeholder = MdItem.getPlaceholder(im)

                                if (isVideo(im.type)) {
                                    MdVideo.fromJSON(im)
                                        .then((video) => {
                                            replacePlaceholder(bindProxy(proxy(video)))
                                        })
                                        .catch((e) => {
                                            console.warn("failed to restore video item", im, e)
                                            removePlaceholder(placeholder)
                                        })
                                } else {
                                    MdImage.fromJSON(im)
                                        .then((im) => {
                                            replacePlaceholder(bindProxy(proxy(im)))
                                        })
                                        .catch((e) => {
                                            console.warn("failed to restore image item", im, e)
                                            removePlaceholder(placeholder)
                                        })
                                }

                                return placeholder
                            },
                        )
                    }
                    return state
                },
            },
        },
    )
    const loader = subscribe(storeInstance.state, () => {
        console.log("storeInstance.state.isLoaded", storeInstance.state)
        if (storeInstance.state.isLoaded) {
            storeReady.resolve()
            loader()
        }
    })
    Lifecycle.onExit(async () => {
        await cleanUp()
        await storeInstance.stop()
    }, true)
    return storeInstance
}

let metadataStore: ReturnType<typeof initStore> | undefined

function getStore() {
    if (!metadataStore) {
        metadataStore = initStore()
    }
    return metadataStore
}

export function getMetadataStore() {
    return getStore().state
}

export function resetMetadataStore() {
    const state = getMetadataStore() as Record<string, unknown>
    for (const [k, v] of Object.entries(initialStoreValues)) {
        state[k] = v
    }
}

export type MediaItemParam = ReadonlyState<MdItem> | MdItem | number | null

// TODO: revisit
async function cleanUp() {
    const clearHistory = getSetting("metadata.clearHistoryOnExit")
    const clearPins = getSetting("metadata.clearPinsOnExit")

    const saveIds = getMetadataStore()
        .items.filter((im) => {
            if (im.pin != null && !clearPins) return true
            if (!clearHistory) return true
            return false
        })
        .map((im) => im.id)

    getMetadataStore().items = getMetadataStore().items.filter((im) => saveIds.includes(im.id))
    await syncImageStore()
}

// TODO: revisit
async function syncImageStore() {
    const ids = getMetadataStore().items.map((im) => im.id)
    await ImageStore.sync(ids)
}

export function selectImage(item?: MediaItemParam | null) {
    const state = getMetadataStore()
    if (item == null) {
        state.currentIndex = null
    } else if (typeof item === "number") {
        if (item < 0 || item >= state.items.length) return
        state.currentIndex = item
    } else {
        const index = state.items.findIndex((im) => im.id === item?.id)
        if (index === -1) return
        state.currentIndex = index
    }
    if (state.currentIndex === null) console.log("selected no image")
}

export function pinImage(image: MediaItemParam, value: number | boolean | null): void
export function pinImage(useCurrent: true, value: number | boolean | null): void
export function pinImage(
    imageOrCurrent: MediaItemParam | true,
    value: number | boolean | null,
): void {
    let index = -1
    if (typeof imageOrCurrent === "number") index = imageOrCurrent
    else if (imageOrCurrent === true) index = getMetadataStore().currentIndex ?? -1
    else index = getMetadataStore().items.findIndex((im) => im.id === imageOrCurrent?.id)

    if (index < 0 || index >= getMetadataStore().items.length) return
    const storeImage = getMetadataStore().items[index]
    if (!storeImage) return

    const pinValue =
        typeof value === "number" ? value : value === true ? Number.POSITIVE_INFINITY : null

    storeImage.pin = pinValue
    reconcilePins()
}

function reconcilePins() {
    const pins = getMetadataStore()
        .items.filter((im) => im.pin != null)
        .sort((a, b) => (a.pin ?? 0) - (b.pin ?? 0))

    pins.forEach((im, i) => {
        im.pin = i + 1
    })
}

export async function clearAll(keepTabs = false) {
    if (keepTabs) getMetadataStore().items = getMetadataStore().items.filter((im) => im.pin != null)
    else getMetadataStore().items = []
    await syncImageStore()
}

async function clearItem(items: Pick<MdItem, "id">[]) {
    const ids = items.map((item) => item.id)
    getMetadataStore().items = getMetadataStore().items.filter((item) => !ids.includes(item.id))
    await syncImageStore()
}

export async function clearCurrent() {
    const cur = getMetadataStore().currentItem
    if (cur) await clearItem([cur])
}

export function addImageItem(item: MdItem) {
    const store = getMetadataStore()
    const itemState = bindProxy(proxy(item))
    store.items.push(itemState)
    selectImage(store.items.length - 1)
    return itemState
}

function replacePlaceholder(item: MdItem) {
    const store = getMetadataStore()
    const index = store.items.findIndex((im) => im.id === item.id)
    if (index === -1) return
    store.items[index] = item
}

function removePlaceholder(item: MdItem) {
    const store = getMetadataStore()
    const index = store.items.findIndex((im) => im.id === item.id)
    if (index === -1) return
    store.items.splice(index, 1)
}

export function setMetadataIsImageLoading(value: boolean) {
    getMetadataStore().isLoadingImage = value
}

export { type ExifType, getExif } from "./imageMetadata"
