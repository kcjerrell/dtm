import { path } from "@tauri-apps/api"
import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import * as fs from "@tauri-apps/plugin-fs"
import { getStoreName } from "@/utils/helpers"
import { createImageThumbnail } from "./thumbnail"
import { VALID_IMAGE_TYPES, VALID_MEDIA_TYPES } from "./types"

let _appDataDir: string
async function getAppDataDir() {
    if (_appDataDir) return _appDataDir
    _appDataDir = await path.appDataDir()
    return _appDataDir
}

let _imageFolder: string
const savingFiles = new Set<string>()
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

async function getFullPath(fname: string): Promise<string> {
    if (!fname) throw new Error("missing media filename")
    return await path.join(await getMediaFolder(), fname)
}

type SavedFile = { fname: string; url: string; createThumbnail: () => Promise<string> }
type SnapshotInput = Uint8Array | { kind: "file" | "url"; location: string }

function getThumbnailName(fname: string) {
    const extension = fname.lastIndexOf(".")
    if (extension < 0 || !VALID_IMAGE_TYPES.includes(fname.slice(extension + 1))) return
    return `${fname.slice(0, extension)}t.png`
}

async function withSnapshot<T>(
    id: string,
    input: SnapshotInput,
    type: string,
    use: (file: SavedFile, retain: () => void) => Promise<T>,
): Promise<T> {
    if (!id) throw new Error("invalid id")
    if (!type || !VALID_MEDIA_TYPES.includes(type))
        throw new Error("invalid or unsupported media type")

    const fname = `${id}.${type}`
    const thumbName = getThumbnailName(fname)
    savingFiles.add(fname)
    if (thumbName) savingFiles.add(thumbName)
    let written = false
    let thumbnailWritten = false
    let retained = false
    try {
        const fullPath = await getFullPath(fname)
        if (input instanceof Uint8Array) {
            if (!input.length) throw new Error("data is empty or missing")
            await fs.writeFile(fullPath, input, { createNew: true })
        } else {
            await invoke("stage_media_snapshot", { source: input, destination: fullPath })
        }
        written = true
        const url = convertFileSrc(fullPath)
        async function createThumbnail() {
            if (!thumbName) return url
            const thumbPath = await getFullPath(thumbName)
            try {
                const data =
                    input instanceof Uint8Array && input.buffer instanceof ArrayBuffer
                        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
                        : await fs.readFile(fullPath)
                const png = await createImageThumbnail(data, type)
                await fs.writeFile(thumbPath, png, { createNew: true })
                thumbnailWritten = true
                return convertFileSrc(thumbPath)
            } catch (error) {
                throw new Error(`Could not create thumbnail for ${fname}`, { cause: error })
            }
        }
        return await use({ fname, url, createThumbnail }, () => {
            retained = true
        })
    } finally {
        if (written && !retained) await removeFile(fname)
        if (thumbName && thumbnailWritten && !retained) await removeFile(thumbName)
        savingFiles.delete(fname)
        if (thumbName) savingFiles.delete(thumbName)
    }
}

async function findMatchingFile(incoming: string, candidates: string[]): Promise<number | null> {
    return await invoke("find_matching_media_file", {
        incoming: await getFullPath(incoming),
        candidates: await Promise.all(candidates.map((fname) => getFullPath(fname))),
    })
}

async function removeOrphanedFiles(referencedFiles: ReadonlySet<string>) {
    const protectedFiles = new Set([...referencedFiles, ...savingFiles])
    for (const fname of referencedFiles) {
        const thumbName = getThumbnailName(fname)
        if (thumbName) protectedFiles.add(thumbName)
    }
    const entries = await fs.readDir(await getMediaFolder())
    for (const entry of entries) {
        if (!entry.isFile || entry.isSymlink) continue
        const original = /^[0-9a-z]{12}\.([a-z0-9]+)$/.exec(entry.name)
        const isOriginal = original && VALID_MEDIA_TYPES.includes(original[1])
        const isThumbnail = /^[0-9a-z]{12}t\.png$/.test(entry.name)
        if (!isOriginal && !isThumbnail) continue
        if (protectedFiles.has(entry.name) || savingFiles.has(entry.name)) continue
        await removeFile(entry.name)
    }
}

async function removeSnapshot(fname: string) {
    const thumbName = getThumbnailName(fname)
    await removeFile(fname)
    if (thumbName) await removeFile(thumbName)
}

/** fname is the filename for a file in appdata/media */
async function removeFile(fname: string) {
    try {
        await fs.remove(await getFullPath(fname))
    } catch (e) {
        console.error(e)
    }
}

async function copyToClipboard(fname: string) {
    const data = await fs.readFile(await getFullPath(fname))
    await invoke("write_clipboard_binary", { ty: `public.${fname.split(".").pop()}`, data })
}

async function saveCopy(fname: string, dest: string) {
    await saveFileCopy(await getFullPath(fname), dest)
}

async function saveFileCopy(source: string, dest: string) {
    await invoke("stage_media_snapshot", {
        source: { kind: "file", location: source },
        destination: dest,
        replaceExisting: true,
    })
}

export const MediaStoreFiles = {
    findMatchingFile,
    getFullPath,
    withSnapshot,
    saveFileCopy,
    removeSnapshot,
    removeOrphanedFiles,
    copyToClipboard,
    saveCopy,
}
