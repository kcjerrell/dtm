import { path } from "@tauri-apps/api"
import { convertFileSrc, invoke } from "@tauri-apps/api/core"
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

type SavedFile = { fname: string; url: string }
type SnapshotInput = Uint8Array | { kind: "file" | "url"; location: string }

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
    savingFiles.add(fname)
    let written = false
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
        return await use({ fname, url: convertFileSrc(fullPath) }, () => {
            retained = true
        })
    } finally {
        if (written && !retained) await removeFile(fname)
        savingFiles.delete(fname)
    }
}

async function saveFile(id: string, data: Uint8Array, type: string): Promise<SavedFile> {
    return await withSnapshot(id, data, type, async (file, retain) => {
        retain()
        return file
    })
}

async function findMatchingFile(incoming: string, candidates: string[]): Promise<number | null> {
    return await invoke("find_matching_media_file", {
        incoming: await getFullPath(incoming),
        candidates: await Promise.all(candidates.map((fname) => getFullPath(fname))),
    })
}

async function removeOrphanedFiles(referencedFiles: ReadonlySet<string>) {
    const entries = await fs.readDir(await getMediaFolder())
    for (const entry of entries) {
        if (!entry.isFile || entry.isSymlink || !/^[0-9a-z]{12}\.[a-z0-9]+$/.test(entry.name))
            continue
        if (!VALID_MEDIA_TYPES.includes(entry.name.slice(13))) continue
        if (referencedFiles.has(entry.name) || savingFiles.has(entry.name)) continue
        await removeFile(entry.name)
    }
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
    await invoke("stage_media_snapshot", {
        source: { kind: "file", location: await getFullPath(fname) },
        destination: dest,
    })
}

async function saveFileCopy(source: string, dest: string) {
    await fs.copyFile(source, dest)
}

export const MediaStoreFiles = {
    findMatchingFile,
    getFullPath,
    withSnapshot,
    saveFileCopy,
    saveFile,
    removeFile,
    removeOrphanedFiles,
    copyToClipboard,
    saveCopy,
}
