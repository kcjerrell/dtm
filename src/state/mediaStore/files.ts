import { path } from "@tauri-apps/api"
import { convertFileSrc } from "@tauri-apps/api/core"
import * as fs from "@tauri-apps/plugin-fs"
import { getStoreName } from "@/utils/helpers"
import { VALID_MEDIA_TYPES } from "./types"

let _appDataDir: string
async function getAppDataDir() {
    if (_appDataDir) return _appDataDir
    _appDataDir = await path.appDataDir()
    return _appDataDir
}

let _imageFolder: string
async function getMediaFolder() {
    if (_imageFolder) return _imageFolder

    const appDataDir = await getAppDataDir()
    const imageFolder = await path.join(appDataDir, getStoreName("media"))
    if (!(await fs.exists(imageFolder))) {
        await fs.mkdir(imageFolder, { recursive: true })
    }
    _imageFolder = imageFolder
    return _imageFolder
}

async function getFullPath(fname: string): Promise<string>
async function getFullPath(id: string, ext: string): Promise<string>
async function getFullPath(arg1: string, arg2?: string): Promise<string> {
    if (arg1 && arg2) return await path.join(await getMediaFolder(), `${arg1}.${arg2}`)
    if (arg1) return await path.join(await getMediaFolder(), arg1)
    throw new Error("invalid arguments")
}

export async function saveFile(
    id: string,
    data: Uint8Array,
    type: string,
): Promise<{ fname: string; url: string }> {
    if (!id) throw new Error("invalid id")
    if (!type || !VALID_MEDIA_TYPES.includes(type))
        throw new Error("invalid or unsupported media type")
    if (!data || data.length === 0) throw new Error("data is empty or missing")

    try {
        const fullPath = await getFullPath(id, type)

        await fs.writeFile(fullPath, data, {
            createNew: true,
        })

        return { fname: await path.basename(fullPath), url: convertFileSrc(fullPath) }
    } catch (e) {
        console.error(e)
        throw e
    }
}

/** fname is the filename for a file in appdata/media */
export async function removeFile(fname: string) {
    await fs.remove(await getFullPath(fname))
}
