import { path } from "@tauri-apps/api"
import { exists, readDir, stat } from "@tauri-apps/plugin-fs"
import { projectsDb } from "@/commands"
import type { DTProjectsState } from "./projectStore"

export type WatchFolderType = {
	path: string
	isMissing?: boolean
}

type ListProjectsResult = {
	path: string,
	filesize: number
	modified: number
}

class WatchFolderService {
	#store: DTProjectsState
	constructor(store: DTProjectsState) {
		this.#store = store
	}

	async loadWatchFolders() {
		const folders = (await projectsDb.listWatchFolders()) as WatchFolderType[]
		this.#store.watchFolders = folders
	}

	async addWatchFolder(folderPath: string) {
		if (await exists(folderPath)) {
			await projectsDb.addWatchFolder(folderPath)
			await this.loadWatchFolders()
		} else {
			throw new Error("DNE")
		}
	}

	async removeWatchFolders(folders: string[] | Readonly<string[]>) {
		await projectsDb.removeWatchFolders(folders as string[])
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

	async listProjects(folder: WatchFolderType) {
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
					fileSize: stats.size,
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
