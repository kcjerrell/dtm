import { path } from "@tauri-apps/api"
import { exists, readDir, stat } from "@tauri-apps/plugin-fs"
import { pdb, type WatchFolder } from "@/commands"
import type { DTProjectsStateType, IDTProjectsStore } from "./projectStore"
import { proxy } from "valtio"
import { arrayIfOnly } from '@/utils/helpers'

const home = await path.homeDir()
const _defaultProjectPath = await path.join(
	home,
	"/Library/Containers/com.liuliu.draw-things/Data/Documents",
)
const _defaultModelInfoPaths = [
	await path.join(home, "/Library/Containers/com.liuliu.draw-things/Data/Library/Caches/net"),
	await path.join(home, "/Library/Containers/com.liuliu.draw-things/Data/Documents/Models"),
]

export type WatchFolderServiceState = {
	projectFolders: WatchFolderState[]
	modelInfoFolders: WatchFolderState[]
	hasProjectDefault: boolean
	hasModelInfoDefault: boolean
}

export type WatchFolderState = WatchFolder & {
	isMissing?: boolean
}

type ListProjectsResult = {
	path: string
	filesize: number
	modified: number
}

class WatchFolderService {
	#dtp: IDTProjectsStore
	rootState: DTProjectsStateType
	state: WatchFolderServiceState

	constructor(dtp: IDTProjectsStore) {
		this.#dtp = dtp
		this.rootState = dtp.state

		this.state = proxy({
			modelInfoFolders: [] as WatchFolderState[],
			hasModelInfoDefault: false,
			projectFolders: [] as WatchFolderState[],
			hasProjectDefault: false,
		})
	}

	async loadWatchFolders() {
		const folders = (await pdb.watchFolders.listAll()) as WatchFolderState[]

		this.state.projectFolders = folders.filter((f) => f.item_type === "Projects")
		this.state.hasProjectDefault = folders.some((f) => f.path === _defaultProjectPath)

		this.state.modelInfoFolders = folders.filter((f) => f.item_type === "ModelInfo")
		// this is potentially slow but should be like 2-4 items so not slow
		this.state.hasModelInfoDefault = _defaultModelInfoPaths.every((f) =>
			this.state.modelInfoFolders.some((mif) => mif.path === f),
		)
	}

	async addWatchFolder(folderPath: string, type: "Projects" | "ModelInfo") {
		if (await exists(folderPath)) {
			await pdb.watchFolders.add(folderPath, type, false)
			await this.loadWatchFolders()
			await this.#dtp.scanner.scanAndWatch()
		} else {
			throw new Error("DNE")
		}
	}

	async removeWatchFolders(folders: WatchFolderState | readonly WatchFolderState[]) {
		await pdb.watchFolders.remove(arrayIfOnly(folders).map(f => f.id))
		await this.loadWatchFolders()
	}

	async addDefaultWatchFolder(type: "Projects" | "ModelInfo") {
		if (type === "Projects") await this.addWatchFolder(_defaultProjectPath, type)
		else if (type === "ModelInfo") {
			for (const f of _defaultModelInfoPaths) {
				await this.addWatchFolder(f, type)
			}
		}
	}

	async listProjects(folder: WatchFolderState) {
		try {
			if (!(await exists(folder.path))) {
				folder.isMissing = true
				return []
			}
			folder.isMissing = false

			const dirFiles = await readDir(folder.path)
			const projects = [] as ListProjectsResult[]
			for (const file of dirFiles) {
				if (!file.isFile || !file.name.endsWith(".sqlite3")) continue
				const projectPath = await path.join(folder.path, file.name)
				const stats = await stat(projectPath)

				projects.push({
					path: projectPath,
					filesize: stats.size,
					modified: stats.mtime?.getTime() ?? 0,
				})
			}

			return projects
		} catch (e) {
			console.error(e)
			return []
		}
	}
}

export default WatchFolderService
