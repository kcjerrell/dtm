import { path } from "@tauri-apps/api"
import { exists, readDir } from "@tauri-apps/plugin-fs"
import DTProjects from "./projectStore"
import { projectsDb } from "@/commands"

export async function loadWatchFolders() {
	const folders = (await projectsDb.listWatchFolders()) as { path: string }[]
	DTProjects.state.watchFolders = folders.map((f) => f.path)
}

export async function addWatchFolder(folderPath: string) {
	if (await exists(folderPath)) {
		await projectsDb.addWatchFolder(folderPath)
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

export async function removeWatchFolders(folders: string[] | Readonly<string[]>) {
	await projectsDb.removeWatchFolders(folders as string[])
	await loadWatchFolders()
}

// TODO: error handling or tracking of missing folders
export async function scanFolder(folderPath: string) {
	try {
		const dirFiles = (await readDir(folderPath)).filter((f) => f.name.endsWith(".sqlite3"))
		const files = await Promise.all(dirFiles.map(async (f) => await path.join(folderPath, f.name)))
		return files
	} catch (e) {
		console.error(e)
		return []
	}
}
