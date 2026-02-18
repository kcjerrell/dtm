import { path } from "@tauri-apps/api"
import { exists, type WatchEvent, watch } from "@tauri-apps/plugin-fs"
import { proxy } from "valtio"
import type { WatchFolder } from "@/commands"
import DTPService from "@/commands/DtpService"
import { makeSelectable, type Selectable } from "@/hooks/useSelectableV"
import va from "@/utils/array"
import { arrayIfOnly } from "@/utils/helpers"
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
    isDtFolderAdded: boolean
    homePath: string | null
    containerPath: string | null
    defaultDataFolder: string | null
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
    watchFolderId?: number
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
        isDtFolderAdded: false,
        homePath: null,
        containerPath: null,
        defaultDataFolder: null,
    })

    async assignPaths() {
        this.state.homePath = await path.homeDir()
        this.state.containerPath = await path.join(
            this.state.homePath,
            "Library/Containers/com.liuliu.draw-things/Data",
        )
        this.state.defaultDataFolder = await path.join(this.state.containerPath, "Documents")

        this.state.isDtFolderAdded = this.state.folders.some(
            (f) => f.path === this.state.defaultDataFolder,
        )
    }

    // watchDisposers = new Map<string, Promise<UnwatchFn>>()
    // watchCallbacks = new DebounceMap<string>(1500)

    constructor() {
        super("watchFolders", "watchfolders")

        this.container.on("watch_folders_changed", (folders: WatchFolder[]) => {
            this.setWatchfolders(folders)
        })

        this.assignPaths().then(() => {
            console.log(this.state.homePath, this.state.containerPath, this.state.defaultDataFolder)
        })
    }

    async loadWatchFolders(supressEvent = false) {
        const res = await DTPService.listWatchFolders()
        this.setWatchfolders(res)
    }

    private setWatchfolders(folders: WatchFolder[]) {
        const foldersState = folders.map((f) => makeSelectable(f as WatchFolderState))
        console.log(folders, this.state.defaultDataFolder)
        this.state.isDtFolderAdded = folders.some(
            (folder) => folder.path === this.state.defaultDataFolder,
        )

        va.set(this.state.folders, foldersState)
    }

    async pickDtFolder() {
        try {
            await DTPService.pickWatchFolder(true)
            return true
        } catch (e) {
            throw e
        }
    }

    async pickWatchFolder() {
        try {
            await DTPService.pickWatchFolder(false)
            return true
        } catch (e) {
            console.error(e)
            return false
        }
    }

    async removeWatchFolders(folder: WatchFolderState): Promise<void>
    async removeWatchFolders(folders: readonly WatchFolderState[]): Promise<void>
    async removeWatchFolders(arg: WatchFolderState | readonly WatchFolderState[]): Promise<void> {
        const folders = arrayIfOnly(arg)
        for (const folder of folders) {
            await DTPService.removeWatchFolder(folder.id)
        }
    }

    async setRecursive(folder: WatchFolderState | readonly WatchFolderState[], recursive: boolean) {
        // disallow changing recursive on default folder
        const toUpdate = arrayIfOnly(folder).filter((f) => f.path !== this.state.defaultDataFolder)
        for (const folder of toUpdate) {
            await DTPService.updateWatchFolder(folder.id, recursive)
        }
    }

    async startWatch(folder: WatchFolderState) {
        throw new Error("deprecated")
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
