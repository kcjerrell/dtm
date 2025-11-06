import { path } from "@tauri-apps/api"
import { invoke } from "@tauri-apps/api/core"
import { exists } from "@tauri-apps/plugin-fs"
import DTProjects from "./projectStore"

export async function loadWatchFolders() {
	const folders = (await invoke("projects_db_list_watch_folders")) as { path: string }[]
	DTProjects.state.watchFolders = folders.map((f) => f.path)
}

export async function addWatchFolder(folderPath: string) {
	if (await exists(folderPath)) {
		await invoke("projects_db_add_watch_folder", { path: folderPath })
		await loadWatchFolders()
	} else {
		throw new Error("DNE")
	}
}

export async function addDefaultWatchFolder() {
	const home = await path.homeDir()
	const defaultPath = await path.join(
		home,
		"/Library/Containers/com.liuliu.draw-things/Data/Documents",
	)

	await addWatchFolder(defaultPath)
}
