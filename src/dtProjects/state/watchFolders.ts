import { path } from "@tauri-apps/api"
import { exists, readDir, stat } from "@tauri-apps/plugin-fs"
import { pdb, type WatchFolder } from "@/commands"
import type { DTProjectsStateType, IDTProjectsStore } from "./projectStore"

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
	#state: DTProjectsStateType

	constructor(dtp: IDTProjectsStore) {
		this.#dtp = dtp
		this.#state = dtp.state
	}

	async loadWatchFolders() {
		const folders = (await pdb.listWatchFolders()) as WatchFolderState[]
		this.#state.watchFolders = folders
	}

	async addWatchFolder(folderPath: string) {
		if (await exists(folderPath)) {
			await pdb.addWatchFolder(folderPath)
			await this.loadWatchFolders()
			await this.#dtp.scanner.scanAndWatch()
		} else {
			throw new Error("DNE")
		}
	}

	async removeWatchFolders(folders: string[] | Readonly<string[]>) {
		await pdb.removeWatchFolders(folders as string[])
		await this.loadWatchFolders()
	}

	async addDefaultWatchFolder() {
		const home = await path.homeDir()
		const defaultPath = await path.join(
			home,
			"/Library/Containers/com.liuliu.draw-things/Data/Documents",
		)

		await this.addWatchFolder(defaultPath)
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
