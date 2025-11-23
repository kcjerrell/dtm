import { path } from "@tauri-apps/api"
import { exists, readDir, stat } from "@tauri-apps/plugin-fs"
import { proxy } from "valtio"
import { pdb, type WatchFolder } from "@/commands"
import { makeSelectable, type Selectable } from "@/hooks/useSelectableV"
import { arrayIfOnly, clearArray } from "@/utils/helpers"
import type { DTProjectsStateType, IDTProjectsStore } from "./projectStore"

const home = await path.homeDir()
const _defaultProjectPath = await path.join(
	home,
	"/Library/Containers/com.liuliu.draw-things/Data/Documents",
)
const _defaultModelInfoPaths = [
	await path.join(home, "/Library/Containers/com.liuliu.draw-things/Data/Library/Caches/net"),
	await path.join(home, "/Library/Containers/com.liuliu.draw-things/Data/Documents/Models"),
]

const modelInfoFilenames = {
	"custom.json": "Model",
	// "custom_prompt_style.json": "",
	"custom_controlnet.json": "Cnet",
	"custom_lora.json": "Lora",
	"uncurated_models.json": "Model",
	"models.json": "Model",
	"loras.json": "Lora",
	"controlnets.json": "Cnet",
} as Record<string, "Model" | "Cnet" | "Lora">

export type WatchFolderServiceState = {
	projectFolders: WatchFolderState[]
	modelInfoFolders: WatchFolderState[]
	hasProjectDefault: boolean
	hasModelInfoDefault: boolean
}

export type WatchFolderState = Selectable<
	WatchFolder & {
		isMissing?: boolean
		selected?: boolean
	}
>

type ListProjectsResult = {
	path: string
	filesize: number
	modified: number
}

type ListModelInfoFilesResult = {
	path: string
	modelType: "Model" | "Cnet" | "Lora"
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
		const res = (await pdb.watchFolders.listAll()) as WatchFolder[]
		const folders = res.map((f) => makeSelectable(f as WatchFolderState))

		clearArray(
			this.state.projectFolders,
			folders.filter((f) => f.item_type === "Projects"),
		)
		// this.state.projectFolders = folders.filter((f) => f.item_type === "Projects")
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
		await pdb.watchFolders.remove(arrayIfOnly(folders).map((f) => f.id))
		await this.loadWatchFolders()
	}

	async setRecursive(folder: WatchFolderState | readonly WatchFolderState[], value: boolean) {
		const toUpdate = arrayIfOnly(folder)
		for (const folder of toUpdate) {
			const updFolder = await pdb.watchFolders.update(folder.id, value)

			const folders =
				folder.item_type === "Projects" ? this.state.projectFolders : this.state.modelInfoFolders

			const idx = folders.findIndex((f) => f.id === folder.id)
			if (idx !== -1) {
				folders[idx].recursive = updFolder.recursive
			}
		}
	}

	async addDefaultWatchFolder(type: "Projects" | "ModelInfo") {
		if (type === "Projects") await this.addWatchFolder(_defaultProjectPath, type)
		else if (type === "ModelInfo") {
			for (const f of _defaultModelInfoPaths) {
				await this.addWatchFolder(f, type)
			}
		}
	}

	async listProjects(folder: WatchFolderState): Promise<string[]> {
		if (folder.item_type !== "Projects") return []

		try {
			if (!(await exists(folder.path))) {
				folder.isMissing = true
				return []
			}
			folder.isMissing = false
			const projects = await findFiles(folder.path, folder.recursive, (f) => f.endsWith(".sqlite3"))

			return projects
		} catch (e) {
			console.error(e)
			return []
		}
	}

	async listModelInfoFiles(folder: WatchFolderState) {
		if (folder.item_type !== "ModelInfo") return []

		try {
			if (!(await exists(folder.path))) {
				folder.isMissing = true
				return []
			}
			folder.isMissing = false

			const dirFiles = await readDir(folder.path)
			const modelInfoFiles = [] as ListModelInfoFilesResult[]
			for (const file of dirFiles) {
				if (!file.isFile || !file.name.endsWith(".json")) continue
				if (file.name in modelInfoFilenames) {
					const infoPath = await path.join(folder.path, file.name)
					modelInfoFiles.push({ path: infoPath, modelType: modelInfoFilenames[file.name] })
				}
			}
			return modelInfoFiles
		} catch (e) {
			console.error(e)
			return []
		}
	}
}

export default WatchFolderService

async function findFiles(
	directory: string,
	recursive: boolean,
	filterFn: (file: string) => boolean,
) {
	const files = [] as string[]
	const dirFiles = await readDir(directory)
	for (const file of dirFiles) {
		if (file.isDirectory && recursive) {
			files.push(...(await findFiles(await path.join(directory, file.name), recursive, filterFn)))
		}

		if (!file.isFile) continue
		if (!filterFn(file.name)) continue
		files.push(await path.join(directory, file.name))
	}
	return files
}
