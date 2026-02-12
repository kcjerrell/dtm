import { path } from "@tauri-apps/api"
import {
    exists,
    readDir,
    stat,
    type UnwatchFn,
    type WatchEvent,
    watch,
} from "@tauri-apps/plugin-fs"
import { proxy } from "valtio"
import { pdb, type WatchFolder } from "@/commands"
import { makeSelectable, type Selectable } from "@/hooks/useSelectableV"
import va from "@/utils/array"
import { DebounceMap } from "@/utils/DebounceMap"
import { arrayIfOnly, compareItems } from "@/utils/helpers"
import { DTPStateController } from "./types"

const modelInfoFilenames = {
    "custom.json": "Model",
    "custom_controlnet.json": "Cnet",
    "custom_lora.json": "Lora",
    "uncurated_models.json": "Model",
    "models.json": "Model",
    "loras.json": "Lora",
    "controlnets.json": "Cnet",
} as Record<string, "Model" | "Cnet" | "Lora">

export type WatchFoldersControllerState = {
    folders: WatchFolderState[]
    hasDefaultDataFolder: boolean
}

export type WatchFolderState = Selectable<
    WatchFolder & {
        isMissing?: boolean
        selected?: boolean
        firstScan?: boolean
    }
>

export type ListModelInfoFilesResult = {
    path: string
    modelType: "Model" | "Cnet" | "Lora"
}

export type ProjectFileStats = {
    path: string
    size: number
    modified: number
    watchFolderPath?: string
}

export type ListFilesResult = {
    /// note that even though only the .sqlite file is given, the .sqlite-wal is included in size/modified
    projects: ProjectFileStats[]
    models: ListModelInfoFilesResult[]
    isMissing?: boolean
}

/**
 * Manages watch folders for projects and model info.
 * Takes a handler for when a full scan is required.
 * useDTP() will be responsible for assigning the handler
 */
export class WatchFoldersController extends DTPStateController<WatchFoldersControllerState> {
    state = proxy<WatchFoldersControllerState>({
        folders: [] as WatchFolderState[],
        hasDefaultDataFolder: false,
    })

    async assignPaths() {
        this._home = await path.homeDir()
        this._containerPath = await path.join(
            this._home,
            "Library/Containers/com.liuliu.draw-things/Data",
        )
        this._defaultDataFolder = await path.join(this._containerPath, "Documents")
    }

    _home: string = ""
    _containerPath: string = ""
    _defaultDataFolder: string = ""

    watchDisposers = new Map<string, Promise<UnwatchFn>>()
    watchCallbacks = new DebounceMap<string>(1500)

    constructor() {
        super("watchFolders", "watchfolders")
    }

    override async handleTags(_tags: string, _desc: Record<string, unknown>) {
        await this.loadWatchFolders()
        return true
    }

    async loadWatchFolders(supressEvent = false) {
        const res = await pdb.watchFolders.listAll()
        const folders = res.map((f) => makeSelectable(f as WatchFolderState))

        for (const folder of folders) {
            if (!this.state.hasDefaultDataFolder && folder.path === this._defaultDataFolder) {
                this.state.hasDefaultDataFolder = true
            }
            // this may throw if the path is forbidden
            try {
                folder.isMissing = !(await exists(folder.path))
            } catch (e) {
                folder.isMissing = true
                console.warn("marking forbidden folder as missing", folder.path, e)
            }
        }

        const prevFolders = [...this.state.folders]
        va.set(this.state.folders, folders)

        const diff = compareItems(prevFolders, folders, (f) => f.id, { ignoreFunctions: true })
        if (!diff.itemsChanged) return

        // why stop and start watching changed?
        for (const folder of [...diff.removed, ...diff.changed]) {
            this.stopWatch(folder.path)
        }

        for (const folder of [...diff.added, ...diff.changed]) {
            if (folder.isMissing) continue
            this.startWatch(folder)
        }

        if (!supressEvent) this.container.emit("watchFoldersChanged", { ...diff })
    }

    // it is not necessary to reload after adding - tags will invalidate
    async addWatchFolder(folderPath: string, recursive = false) {
        if (await exists(folderPath)) {
            const isDtFolder = folderPath === this._defaultDataFolder
            await pdb.watchFolders.add(folderPath, recursive || isDtFolder)
        } else {
            throw new Error("DNE")
        }
    }

    // it is not necessary to reload after removing - tags will invalidate
    async removeWatchFolders(folder: WatchFolderState): Promise<void>
    async removeWatchFolders(folders: readonly WatchFolderState[]): Promise<void>
    async removeWatchFolders(arg: WatchFolderState | readonly WatchFolderState[]): Promise<void> {
        const folders = arrayIfOnly(arg)
        await pdb.watchFolders.remove(folders.map((f) => f.id))
        if (folders.some((f) => f.path === this._defaultDataFolder))
            this.state.hasDefaultDataFolder = false
    }

    async setRecursive(folder: WatchFolderState | readonly WatchFolderState[], value: boolean) {
        // disallow changing recursive on default folder
        const toUpdate = arrayIfOnly(folder).filter((f) => f.path !== this._defaultDataFolder)
        for (const folder of toUpdate) {
            const updFolder = await pdb.watchFolders.update(folder.id, value)

            // TODO: is this necessary? I don't think so...
            const idx = this.state.folders.findIndex((f) => f.id === folder.id)
            if (idx !== -1) {
                this.state.folders[idx].recursive = updFolder.recursive
            }
        }
    }

    async addDefaultDataFolder() {
        await this.addWatchFolder(this._defaultDataFolder, true)
    }

    async listFiles(folder: WatchFolderState): Promise<ListFilesResult> {
        const result: ListFilesResult = {
            projects: [],
            models: [],
            isMissing: false,
        }

        if (!exists(folder.path)) {
            result.isMissing = true
            return result
        }

        const toCheck = [folder.path]

        async function readFolder(currentFolder: string) {
            try {
                const files = await readDir(currentFolder)
                for (const file of files) {
                    const filePath = await path.join(currentFolder, file.name)
                    // add folders to list
                    if (file.isDirectory) {
                        toCheck.push(filePath)
                    }
                    // check project files - this also will check the -wal file
                    else if (file.name.endsWith(".sqlite3")) {
                        const fileStats = await stat(filePath)
                        if (!fileStats) continue

                        const walPath = filePath + "-wal"
                        const walStats = (await exists(walPath)) ? await stat(walPath) : undefined

                        const project: ProjectFileStats = {
                            path: filePath,
                            size: fileStats.size + (walStats?.size ?? 0),
                            modified: Math.max(
                                fileStats.mtime?.getTime() ?? 0,
                                walStats?.mtime?.getTime() ?? 0,
                            ),
                            watchFolderPath: currentFolder,
                        }
                        result.projects.push(project)
                    }
                    // check model files
                    else if (file.name.endsWith(".json") && file.name in modelInfoFilenames) {
                        result.models.push({
                            path: filePath,
                            modelType: modelInfoFilenames[file.name],
                        })
                    }
                }
            } catch (e) {
                console.warn(e)
            }
        }

        while (toCheck.length > 0) {
            const currentFolder = toCheck.shift()
            if (!currentFolder) continue
            await readFolder(currentFolder)
            if (!folder.recursive) break
        }

        return result
    }

    async getFolderForProject(project: string): Promise<WatchFolderState | undefined> {
        const folders = [] as WatchFolderState[]
        for (const folder of this.state.folders) {
            const sep = await path.sep()
            const folderWithSep = folder.path.endsWith(sep) ? folder.path : folder.path + sep
            if (project.startsWith(folderWithSep)) {
                const projectDir = await path.dirname(project)
                if (projectDir === folder.path || folder.recursive) {
                    folders.push(folder)
                }
            }
        }

        folders.sort((a, b) => b.path.length - a.path.length)
        return folders[0] ?? undefined
    }

    async startWatch(folder: WatchFolderState) {
        if (this.watchDisposers.has(folder.path))
            throw new Error(`must stop watching folder first, ${folder.path}`)

        try {
            if (!(await exists(folder.path))) {
                console.warn("watch folder does not exist, skipping watch", folder.path)
                return
            }
            const unwatch = watch(
                folder.path,
                async (e) => {
                    if (!shouldReact(e)) return
                    const projectFiles = e.paths
                        .filter((p) => p.endsWith(".sqlite3") || p.endsWith(".sqlite3-wal"))
                        .map((p) => p.replace(/-wal$/g, ""))
                    if (projectFiles.length === 0) return
                    console.debug("watch event", JSON.stringify(e))
                    const uniqueFiles = Array.from(new Set(projectFiles))

                    for (const file of uniqueFiles) {
                        this.watchCallbacks.set(file, () => {
                            this.container.emit("projectFilesChanged", { files: [file] })
                        })
                    }
                },
                { delayMs: 1500, recursive: folder.recursive },
            )
            this.watchDisposers.set(folder.path, unwatch)
            console.log("watching folder for changes:", folder.path)
        } catch (e) {
            console.warn("can't watch folder", folder.path, e)
        }
    }

    async stopWatch(folder: string) {
        if (!this.watchDisposers.has(folder)) return
        console.debug("stopping watch for folder:", folder)
        const unwatchPromise = this.watchDisposers.get(folder)
        this.watchDisposers.delete(folder)

        const unwatch = await unwatchPromise
        unwatch?.()
    }

    get defaultProjectPath() {
        return this._defaultDataFolder
    }

    get containerPath() {
        return this._containerPath
    }

    override dispose() {
        super.dispose()

        for (const folder of this.watchDisposers.keys()) {
            this.stopWatch(folder)
        }
    }
}

export default WatchFoldersController

function shouldReact(event: WatchEvent) {
    if (event.paths.every((p) => p.endsWith("shm"))) return false

    const type = event.type as object

    if ("access" in type) return false
    if ("remove" in type) return true
    if ("create" in type) return true
    if ("modify" in type && type.modify && typeof type.modify === "object") {
        // only react to changes in the file, not metadata changes
        if ("kind" in type.modify && type.modify.kind === "metadata") return false
        return true
    }

    return true
}
