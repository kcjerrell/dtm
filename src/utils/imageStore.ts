import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import * as path from "@tauri-apps/api/path"
import * as fs from "@tauri-apps/plugin-fs"
import { store as createStore } from "@tauri-store/valtio"
import { customAlphabet } from "nanoid"
import { getVideoThumbnail } from "@/commands"
import { getStoreName } from "./helpers"

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12)

let _appDataDir: string
async function getAppDataDir() {
    if (_appDataDir) return _appDataDir
    _appDataDir = await path.appDataDir()
    return _appDataDir
}

let _imageFolder: string
async function getImageFolder() {
    if (_imageFolder) return _imageFolder
    const appDataDir = await getAppDataDir()
    _imageFolder = await path.join(appDataDir, getStoreName("images"))
    return _imageFolder
}

type ImageStoreEntryBase = {
    id: string
    type: string
    videoPath?: string
}

export type ImageStoreEntry = {
    id: string
    type: string
    url: string
    thumbUrl: string
    cachePath: string
}

function initStore() {
    const storeInstance = createStore(
        getStoreName("images"),
        { images: {} as Record<string, ImageStoreEntryBase> },
        {
            autoStart: true,
            syncStrategy: "debounce",
            syncInterval: 1000,
            saveOnChange: true,
        },
    )
    window.addEventListener("unload", () => storeInstance.stop())
    return storeInstance
}

let imagesStore: ReturnType<typeof initStore> | null = null

function getStore() {
    if (!imagesStore) {
        imagesStore = initStore()
    }
    return imagesStore
}

const _imageTypes = ["png", "tiff", "jpg", "webp"]
const _videoTypes = ["mp4", "webm", "mov", "m4v"]
const _validTypes = [..._imageTypes, ..._videoTypes]

async function saveVideo(videoPath: string, type: string): Promise<ImageStoreEntry | undefined> {
    const id = await getNewId()
    const entry = { id, type, videoPath }
    getStore().state.images[id] = entry

    const url = convertFileSrc(videoPath)
    const thumbUrl = isVideo(type) ? convertFileSrc(await getThumbPath(id)) : url
    return { ...entry, url, thumbUrl, cachePath: videoPath }
}

async function saveMedia(
    data: Uint8Array | string,
    type: string,
): Promise<ImageStoreEntry | undefined> {
    if (!type || !_validTypes.includes(type)) return
    if (!data || data.length === 0) return

    if (typeof data === "string") {
        return await saveVideo(data, type)
    }

    try {
        const id = await getNewId()
        const fname = await getFullPath(id, type)

        if (!(await fs.exists(await getImageFolder()))) {
            await fs.mkdir(await getImageFolder(), { recursive: true })
        }

        await fs.writeFile(fname, data, {
            createNew: true,
        })

        if (isVideo(type)) {
            const thumbData = await getVideoThumbnail(fname)
            await fs.writeFile(await getThumbPath(id), thumbData)
        }

        const entry = { id, type }
        getStore().state.images[id] = entry

        const url = convertFileSrc(fname)
        const thumbUrl = isVideo(type) ? convertFileSrc(await getThumbPath(id)) : url
        return { ...entry, url, thumbUrl, cachePath: fname }
    } catch (e) {
        console.error(e)
        return
    }
}

async function getImage(id: string): Promise<ImageStoreEntry | undefined> {
    const entry = getStore().state.images[id]

    if (!entry) return
    const fullPath = entry.videoPath ?? (await getFullPath(id, entry.type))
    const url = convertFileSrc(fullPath)
    const thumbUrl = isVideo(entry.type) ? convertFileSrc(await getThumbPath(id)) : url
    return { ...entry, url, thumbUrl, cachePath: fullPath }
}

async function getFullPath(id: string, ext: string) {
    return await path.join(await getImageFolder(), `${id}.${ext}`)
}

async function getThumbPath(id: string) {
    return await path.join(await getImageFolder(), `${id}_thumb.png`)
}

async function getNewId() {
    let id: string
    const state = getStore().state

    do {
        id = nanoid()
    } while (id in state.images)

    return id
}

async function removeImage(id: string) {
    const state = getStore().state
    const item = state.images[id]
    if (!item) return
    await removeFile(await getFullPath(id, item.type))
    await removeFile(await getThumbPath(id))
    delete state.images[id]
}

async function syncImages(keepIds: string[] = []) {
    const state = getStore().state
    for (const id of Object.keys(state.images)) {
        if (keepIds.includes(id)) continue

        await removeImage(id)
    }

    // for (const file of await fs.readDir(imageFolder)) {
    // 	if (file.name.startsWith(".") || file.isDirectory || file.isSymlink) continue
    // 	console.log("looking at ", file.name)
    // 	const filename = await path.basename(file.name, await path.extname(file.name))
    // 	const id = filename.split("_")[0]

    // 	if (!keepIds.includes(id)) {
    // 		await removeFile(await path.join(imageFolder, file.name))
    // 	}
    // }
}

async function copyImage(id: string) {
    const entry = await getImage(id)
    if (!entry) return
    console.debug("copying image", entry.id)
    const path = await getFullPath(id, entry.type)
    const data = await fs.readFile(path)
    await invoke("write_clipboard_binary", { ty: `public.${entry.type}`, data })
}

async function saveCopy(id: string, dest: string) {
    const entry = await getImage(id)
    if (!entry) return
    const path = await getFullPath(id, entry.type)
    await fs.copyFile(path, dest)
}

const ImageStore = {
    save: saveMedia,
    get: getImage,
    remove: removeImage,
    sync: syncImages,
    copy: copyImage,
    saveCopy: saveCopy,
}

export default ImageStore

async function removeFile(filePath: string) {
    try {
        if (await fs.exists(filePath)) {
            await fs.remove(filePath)
        }
    } catch (e) {
        console.error(e)
    }
}

export function isVideo(extension: string): boolean
export function isVideo(filename: string): boolean
export function isVideo(filename: string) {
    const ext = filename.split(".").pop()?.toLowerCase()
    return ext && _videoTypes.includes(ext)
}

export function isImage(extension: string): boolean
export function isImage(filename: string): boolean
export function isImage(filename: string) {
    const ext = filename.split(".").pop()?.toLowerCase()
    return ext && _imageTypes.includes(ext)
}
