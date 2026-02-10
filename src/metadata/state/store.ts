import { readFile } from "@tauri-apps/plugin-fs"
import { store } from "@tauri-store/valtio"
import * as exifr from "exifr"
import { proxy } from "valtio"
import AppStore from "@/hooks/appState"
import type { ImageSource } from "@/types"
import { getStoreName } from "@/utils/helpers"
import ImageStore from "@/utils/imageStore"
import { getDrawThingsDataFromExif } from "../helpers"
import { ImageItem, type ImageItemConstructorOpts } from "./ImageItem"

export function bind<T extends object>(instance: T): T {
    const props = Object.getOwnPropertyNames(Object.getPrototypeOf(instance))

    for (const prop of props) {
        const method = instance[prop as keyof T]
        if (prop === "constructor" || typeof method !== "function") continue
            ; (instance as Record<string, unknown>)[prop] = (...args: unknown[]) =>
                method.apply(instance, args)
    }

    return instance
}


function initStore() {
    const storeInstance = store(
        getStoreName("metadata"),
        {
            images: [] as ImageItem[],
            currentIndex: null as number | null,
            zoomPreview: false,
            showHistory: false,
            maxHistory: 10,
            get currentImage(): ImageItem | undefined {
                const s = getMetadataStore()
                if (s.currentIndex === null) return undefined
                return s.images[s.currentIndex]
            },
        },
        {
            autoStart: true,
            filterKeys: ["currentImage", "currentIndex", "zoomPreview", "showHistory"],
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

                    if ("images" in state && Array.isArray(state.images)) {
                        state.images = state.images.map((im) => {
                            if (im instanceof ImageItem) return im
                            const newIm = bind(proxy(new ImageItem(im as ImageItemConstructorOpts)))
                            newIm.loadEntry()
                            newIm.loadExif()
                            return newIm
                        })
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
        metadataStore = initStore()
    }
    return metadataStore!
}

export function getMetadataStore() {
    return getStore().state
}

export type ImageItemParam = ReadonlyState<ImageItem> | ImageItem | number | null

// const unlisten = getCurrentWindow().onCloseRequested(async (e) => {
//     e.preventDefault()
//     const window = getCurrentWindow()
//     await window.hide()
//     await cleanUp()
//     await window.destroy()
// })

async function cleanUp() {
    const clearHistory = AppStore.store.clearHistoryOnExit
    const clearPins = AppStore.store.clearPinsOnExit

    const saveIds = getMetadataStore().images
        .filter((im) => {
            if (im.pin != null && !clearPins) return true
            if (!clearHistory) return true
            return false
        })
        .map((im) => im.id)

    getMetadataStore().images = getMetadataStore().images.filter((im) => saveIds.includes(im.id))
    await syncImageStore()
}

async function syncImageStore() {
    const ids = getMetadataStore().images.map((im) => im.id)
    await ImageStore.sync(ids)
}

export function selectImage(image?: ImageItemParam | null) {
    const state = getMetadataStore()
    if (image == null) {
        state.currentIndex = null
    } else if (typeof image === "number") {
        if (image < 0 || image >= state.images.length) return
        state.currentIndex = image
    } else {
        const index = state.images.findIndex((im) => im.id === image?.id)
        if (index === -1) return
        state.currentIndex = index
    }
    if (state.currentIndex === null) console.log("selected no image")
    else console.debug("selected image", state.images[state.currentIndex].id)
}

export function pinImage(image: ImageItemParam, value: number | boolean | null): void
export function pinImage(useCurrent: true, value: number | boolean | null): void
export function pinImage(
    imageOrCurrent: ImageItemParam | true,
    value: number | boolean | null,
): void {
    let index = -1
    if (typeof imageOrCurrent === "number") index = imageOrCurrent
    else if (imageOrCurrent === true) index = getMetadataStore().currentIndex ?? -1
    else index = getMetadataStore().images.findIndex((im) => im.id === imageOrCurrent?.id)

    if (index < 0 || index >= getMetadataStore().images.length) return
    const storeImage = getMetadataStore().images[index]
    if (!storeImage) return

    const pinValue =
        typeof value === "number" ? value : value === true ? Number.POSITIVE_INFINITY : null

    storeImage.pin = pinValue
    reconcilePins()
}

function reconcilePins() {
    const pins = getMetadataStore().images
        .filter((im) => im.pin != null)
        .sort((a, b) => (a.pin ?? 0) - (b.pin ?? 0))

    pins.forEach((im, i) => {
        im.pin = i + 1
    })
}

export async function clearAll(keepTabs = false) {
    if (keepTabs) getMetadataStore().images = getMetadataStore().images.filter((im) => im.pin != null)
    else getMetadataStore().images = []
    await syncImageStore()
}

async function clearImage(images: Pick<ImageItem, "id">[]) {
    const ids = images.map((image) => image.id)
    getMetadataStore().images = getMetadataStore().images.filter((image) => !ids.includes(image.id))
    await syncImageStore()
}

export async function clearCurrent() {
    const cur = getMetadataStore().currentImage
    if (cur) await clearImage([cur])
}

export async function createImageItem(
    imageData: Uint8Array<ArrayBuffer>,
    type: string,
    source: ImageSource,
) {
    console.trace("create image item")

    if (!imageData || !type || !source) return null
    if (imageData.length === 0) return null

    // save image to image store
    const entry = await ImageStore.save(imageData, type)
    if (!entry) return null

    const exif = await getExif(imageData.buffer)
    const dtData = getDrawThingsDataFromExif(exif)

    const item: ImageItemConstructorOpts = {
        id: entry.id,
        entry,
        source,
        loadedAt: Date.now(),
        pin: null,
        type,
        exif,
        dtData,
    }

    const imageItem = bind(proxy(new ImageItem(item)))
    const itemIndex = getMetadataStore().images.push(imageItem) - 1

    selectImage(itemIndex)
    return getMetadataStore().images[itemIndex]
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
    const index = getMetadataStore().images.indexOf(imageItem)
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
        getMetadataStore().images[index] = bind(proxy(new ImageItem(item)))
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
