import { readFile } from "@tauri-apps/plugin-fs"
import { store } from "@tauri-store/valtio"
import * as exifr from "exifr"
import { proxy } from "valtio"
import AppStore from "@/hooks/appState"
import type { ImageSource } from "@/types"
import { getStoreName } from "@/utils/helpers"
import ImageStore, { isVideo } from "@/utils/imageStore"
import { getDrawThingsDataFromExif } from "../helpers"
import { ImageItem, type ImageItemConstructorOpts } from "./ImageItem"
import { bindProxy } from "@/utils/valtio"
import MediaItem from "./mediaItem"
import { VideoItem, VideoItemConstructorOpts } from "./VideoItem"

function initStore() {
    const storeInstance = store(
        getStoreName("metadata"),
        {
            items: [] as MediaItem[],
            currentIndex: null as number | null,
            zoomPreview: false,
            showHistory: false,
            maxHistory: 10,
            get currentItem(): MediaItem | undefined {
                const s = getMetadataStore()
                if (s.currentIndex === null) return undefined
                return s.items[s.currentIndex]
            },
        },
        {
            autoStart: true,
            filterKeys: ["currentItem", "currentIndex", "zoomPreview", "showHistory"],
            filterKeysStrategy: "omit",
            saveOnChange: true,
            saveOnExit: true,
            saveStrategy: "debounce",
            syncStrategy: "throttle",
            saveInterval: 60000,
            syncInterval: 1000,

            hooks: {
                beforeFrontendSync(state) {
                    if (typeof state !== "object" || state === null) return state

                    if ("items" in state && Array.isArray(state.items)) {
                        state.items = state.items.map(
                            (im: MediaItem | ReturnType<MediaItem["toJSON"]>) => {
                                if (im instanceof MediaItem) return im
                                if (isVideo(im.type)) {
                                    return bindProxy(
                                        proxy(new VideoItem(im as VideoItemConstructorOpts)),
                                    )
                                } else {
                                    const newIm = bindProxy(
                                        proxy(new ImageItem(im as ImageItemConstructorOpts)),
                                    )
                                    newIm.loadEntry().catch(console.warn)
                                    newIm.loadExif().catch(console.warn)
                                    return newIm
                                }
                            },
                        )
                    }
                    return state
                },
            },
        },
    )
    window.addEventListener("unload", () => {
        cleanUp()
        getStore().stop()
    })
    return storeInstance
}

let metadataStore: ReturnType<typeof initStore> | undefined

function getStore() {
    if (!metadataStore) {
        console.debug("METADATA: creating store")
        metadataStore = initStore()
    }
    return metadataStore
}

export function getMetadataStore() {
    return getStore().state
}

export type MediaItemParam = ReadonlyState<MediaItem> | MediaItem | number | null

// TODO: revisit
async function cleanUp() {
    const clearHistory = AppStore.store.clearHistoryOnExit
    const clearPins = AppStore.store.clearPinsOnExit

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
    else console.debug("selected image", state.items[state.currentIndex].id)
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

async function clearItem(items: Pick<MediaItem, "id">[]) {
    const ids = items.map((item) => item.id)
    getMetadataStore().items = getMetadataStore().items.filter((item) => !ids.includes(item.id))
    await syncImageStore()
}

export async function clearCurrent() {
    const cur = getMetadataStore().currentItem
    if (cur) await clearItem([cur])
}

export function addImageItem(item: MediaItem) {
    console.log("adding image item", item)
    const store = getMetadataStore()
    const itemState = bindProxy(proxy(item))
    store.items.push(itemState)
    selectImage(store.items.length - 1)
    return itemState
}

export async function createImageItem(
    imageData: Uint8Array<ArrayBuffer> | string,
    type: string,
    source: ImageSource,
) {
    console.trace("create image item")
    const store = getMetadataStore()

    if (!imageData || !type || !source) return null
    if (imageData.length === 0) return null

    try {
        // save image to image store
        const entry = await ImageStore.save(imageData, type)
        console.log("saved image", entry)
        if (!entry) return null

        // const exif = isVideo(type)
        //     ? JSON.parse(await getVideoMetadata(entry.cachePath))
        //     : await getExif(imageData.buffer)
        // const dtData = getDrawThingsDataFromExif(exif)

        const item: ImageItemConstructorOpts = {
            id: entry.id,
            entry,
            source,
            loadedAt: Date.now(),
            pin: null,
            type,
            // exif,
            // dtData,
        }

        const imageItem = bindProxy(proxy(new ImageItem(item)))
        console.log("image item", imageItem)
        const itemIndex = store.items.push(imageItem) - 1
        console.log("item index", itemIndex)

        selectImage(itemIndex)
        return store.items[itemIndex]
    } catch (e) {
        console.error(e)
        return null
    }
}

/**
 * replace the given ImageItem with a new one from imageData, only if the new one has DTMetadata
 * and the original does not
 */
async function replaceWithBetter(
    imageItem: ImageItem,
    imageData: Uint8Array<ArrayBuffer>,
    imageType: string,
    source: ImageSource,
) {
    const index = getMetadataStore().items.indexOf(imageItem)
    if (index === -1) return

    const exif = await getExif(imageData.buffer)
    const dtData = getDrawThingsDataFromExif(exif)

    if (dtData && !imageItem.dtData) {
        const entry = await ImageStore.save(imageData, imageType)
        if (!entry) return

        const item: ImageItemConstructorOpts = {
            id: entry.id,
            entry,
            source,
            loadedAt: imageItem.loadedAt,
            pin: null,
            type: imageType,
            exif,
            dtData,
        }
        getMetadataStore().items[index] = bindProxy(proxy(new ImageItem(item)))
    }
    await syncImageStore()
    if (dtData) return dtData
}

export type ExifType = Record<string, Record<string, unknown>>
export async function getExif(imagePath: string): Promise<ExifType | null>
export async function getExif(imageDataBuffer: ArrayBuffer): Promise<ExifType | null>
export async function getExif(arg: ArrayBuffer | string): Promise<ExifType | null> {
    let data = typeof arg !== "string" ? arg : null

    if (data === null) data = (await readFile(arg as string)).buffer

    try {
        // return await ExifReader.load(data, { async: true })
        const exif = await exifr.parse(data, {
            xmp: { multiSegment: true, parse: true },
            makerNote: true,
            userComment: true,
            icc: true,
            iptc: true,
            mergeOutput: false,
        })
        console.log(exif)
        return exif
    } catch (e) {
        console.warn(e)
        return null
    }
}
