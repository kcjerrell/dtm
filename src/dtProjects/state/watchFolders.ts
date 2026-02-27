import { path } from "@tauri-apps/api"
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
        isDtData?: boolean
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

    constructor() {
        super("watchFolders")

        this.container.on("watch_folders_changed", async () => {
            await this.loadWatchFolders()
            await this.container.getService("projects").loadProjects()
        })

        this.assignPaths().then(() => {})
    }

    async loadWatchFolders() {
        const res = await DTPService.listWatchFolders()
        return this.setWatchfolders(res)
    }

    private setWatchfolders(folders: WatchFolder[]) {
        const foldersState = folders.map((f) => this.createWatchFolderState(f))
        this.state.isDtFolderAdded = foldersState.some((folder) => folder.isDtData)

        va.set(this.state.folders, foldersState)
        return this.state.folders
    }

    private createWatchFolderState(folder: WatchFolder): WatchFolderState {
        return makeSelectable({ ...folder, isDtData: folder.path === this.state.defaultDataFolder })
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
}

export default WatchFoldersController
