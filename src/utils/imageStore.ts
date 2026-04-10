import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import * as path from "@tauri-apps/api/path"
import * as fs from "@tauri-apps/plugin-fs"
import { store as createStore } from "@tauri-store/valtio"
import { customAlphabet } from "nanoid"
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
    const imageFolder = await path.join(appDataDir, getStoreName("images"))
    if (!(await fs.exists(imageFolder))) {
        await fs.mkdir(imageFolder, { recursive: true })
    }
    _imageFolder = imageFolder
    return _imageFolder
}

type ImageStoreEntryBase = {
    id: string
    type: string
}

export type ImageStoreEntry = {
    id: string
    type: string
    url: string
    thumbUrl: string
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
            hooks: {
                beforeFrontendSync: (state) => {
                    console.log("fe sync")
                    return state
                },
            },
        },
    )
    window.addEventListener("unload", () => storeInstance.stop())
    return storeInstance
}

let imagesStore: ReturnType<typeof initStore> | null = null

function getStore() {
    if (!imagesStore) {
        console.debug("IMAGES: creating store")
        imagesStore = initStore()
    }
    return imagesStore
}

const _validTypes = ["png", "tiff", "jpg", "webp"]

async function saveImage(image: Uint8Array, type: string): Promise<ImageStoreEntry | undefined> {
    if (!type || !_validTypes.includes(type)) return
    if (!image || image.length === 0) return

    try {
        const id = await getNewId()
        const fname = await getFullPath(id, type)

        await fs.writeFile(fname, image, {
            createNew: true,
        })

        const entry = { id, type }
        getStore().state.images[id] = entry

        const url = convertFileSrc(fname)
        return { ...entry, url, thumbUrl: url }
    } catch (e) {
        console.error(e)
        return
    }
}

async function getImage(id: string): Promise<ImageStoreEntry | undefined> {
    const entry = getStore().state.images[id]

    if (!entry) return

    const url = convertFileSrc(await getFullPath(id, entry.type))
    // const thumbUrl = convertFileSrc(await getThumbPath(id))
    return { ...entry, url, thumbUrl: url }
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
    save: saveImage,
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
