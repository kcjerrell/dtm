import { path } from "@tauri-apps/api"
import { exists, readDir, type UnwatchFn, watch, writeTextFile } from "@tauri-apps/plugin-fs"
import { proxy } from "valtio"
import { pdb, type WatchFolder } from "@/commands"
import { DTPStateController } from "@/hooks/StateController"
import { makeSelectable, type Selectable } from "@/hooks/useSelectableV"
import va from "@/utils/array"
import { arrayIfOnly } from "@/utils/helpers"
import { compileOfficialModels } from "@/utils/models"

const home = await path.homeDir()
const _defaultProjectPath = await path.join(
	home,
	"/Library/Containers/com.liuliu.draw-things/Data/Documents",
)
const _defaultModelInfoPaths = [
	await path.join(home, "/Library/Containers/com.liuliu.draw-things/Data/Library/Caches/net"),
	await path.join(home, "/Library/Containers/com.liuliu.draw-things/Data/Documents/Models"),
	"remote:official",
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

export type WatchFoldersControllerState = {
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

type ListModelInfoFilesResult = {
	path: string
	modelType: "Model" | "Cnet" | "Lora"
}

/**
 * Manages watch folders for projects and model info.
 * Takes a handler for when a full scan is required.
 * useDTP() will be responsible for assigning the handler
 */
export class WatchFoldersController extends DTPStateController<WatchFoldersControllerState> {
	state = proxy<WatchFoldersControllerState>({
		modelInfoFolders: [] as WatchFolderState[],
		hasModelInfoDefault: false,
		projectFolders: [] as WatchFolderState[],
		hasProjectDefault: false,
	})

	onScanRequired: () => void = () => {
		console.warn("Watch folders may be out of sync, handler not assigned")
	}
	watchDisposers: UnwatchFn[] = []

	async loadWatchFolders() {
		const res = (await pdb.watchFolders.listAll()) as WatchFolder[]
		const folders = res.map((f) => makeSelectable(f as WatchFolderState))

		va.set(
			this.state.projectFolders,
			folders.filter((f) => f.item_type === "Projects"),
		)
		this.state.hasProjectDefault = folders.some((f) => f.path === _defaultProjectPath)

		va.set(
			this.state.modelInfoFolders,
			folders.filter((f) => f.item_type === "ModelInfo"),
		)
		this.state.hasModelInfoDefault = _defaultModelInfoPaths.every((f) =>
			this.state.modelInfoFolders.some((mif) => mif.path === f),
		)
	}

	async addWatchFolder(folderPath: string, type: "Projects" | "ModelInfo") {
		if (folderPath.startsWith("remote")) {
			await pdb.watchFolders.add(folderPath, type, false)
			this.onScanRequired()
		} else if (await exists(folderPath)) {
			await pdb.watchFolders.add(folderPath, type, false)
			this.onScanRequired()
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
		if (folder.path.startsWith("remote")) return this.getRemoteCombinedModels(folder)

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

	async getRemoteCombinedModels(folder: WatchFolderState) {
		const res = await fetch("https://kcjerrell.github.io/dt-models/combined_models.json")
		const data = await res.json()
		console.log(folder, data.lastUpdate)
		if (folder.last_updated && folder.last_updated >= data.lastUpdate) {
			console.log("models up to date")
			return []
		}
		const check = (key: string) => key in data && Array.isArray(data[key])

		const modelInfoFiles = [] as ListModelInfoFilesResult[]

		const models = []
		if (check("officialModels")) models.push(...data.officialModels)
		if (check("communityModels")) models.push(...data.communityModels)
		if (check("uncuratedModels")) models.push(...data.uncuratedModels)
		if (models.length) {
			const filePath = await path.join(await path.appDataDir(), "combined_models.json")
			await writeTextFile(filePath, JSON.stringify(models, null, 2))
			modelInfoFiles.push({ path: filePath, modelType: "Model" })
		}

		const cnets = []
		if (check("officialCnets")) cnets.push(...data.officialCnets)
		if (check("communityCnets")) cnets.push(...data.communityCnets)
		if (cnets.length) {
			const filePath = await path.join(await path.appDataDir(), "combined_cnets.json")
			await writeTextFile(filePath, JSON.stringify(cnets, null, 2))
			modelInfoFiles.push({ path: filePath, modelType: "Cnet" })
		}

		const loras = []
		if (check("officialLoras")) loras.push(...data.officialLoras)
		if (check("communityLoras")) loras.push(...data.communityLoras)
		if (loras.length) {
			const filePath = await path.join(await path.appDataDir(), "combined_loras.json")
			await writeTextFile(filePath, JSON.stringify(loras, null, 2))
			modelInfoFiles.push({ path: filePath, modelType: "Lora" })
		}

		await pdb.watchFolders.update(folder.id, undefined, data.lastUpdate)

		return modelInfoFiles
	}

	async getRemoteModelInfoFiles() {
		console.log("fetching official models...")
		const filenames = ["Model", "ControlNet", "LoRA"] as const
		const modelFiles = [] as ListModelInfoFilesResult[]
		for (const filename of filenames) {
			console.log("fetching", filename)
			try {
				const modelInfo = await compileOfficialModels(filename)
				const modelInfoJson = JSON.stringify(modelInfo, null, 2)
				const filePath = await path.join(
					await path.appDataDir(),
					`official_${filename.toLowerCase()}.json`,
				)
				await writeTextFile(filePath, modelInfoJson)
				modelFiles.push({
					path: filePath,
					modelType: filename.replace("LoRA", "Lora").replace("ControlNet", "Cnet") as
						| "Model"
						| "Cnet"
						| "Lora",
				})
			} catch (e) {
				console.error(e)
			}
		}
		return modelFiles
	}

	async startWatch(callback: (projectFiles: string[]) => Promise<void>) {
		this.stopWatch()

		for (const projectFolder of this.state.projectFolders) {
			const unwatch = await watch(
				projectFolder.path,
				async (e) => {
					const projectFiles = e.paths.filter((p) => p.endsWith(".sqlite3"))
					if (projectFiles.length === 0) return
					console.log(projectFiles, e.attrs, e.type)
					await callback(projectFiles)
				},
				{ delayMs: 2000, recursive: projectFolder.recursive },
			)
			this.watchDisposers.push(unwatch)
		}
	}

	stopWatch() {
		this.watchDisposers.forEach((u) => {
			u()
		})
	}
}

export default WatchFoldersController

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
