import { invoke } from "@tauri-apps/api/core"
import { proxy } from "valtio"
import { DTImage, TensorHistory } from "@/types"
import { open } from "@tauri-apps/plugin-dialog"
import { listen } from "@tauri-apps/api/event"
import { readDir } from "@tauri-apps/plugin-fs"
import { path } from "@tauri-apps/api"
import { ScanProgressEvent, DTProject } from "../types"

let scanProgressUnlisten: () => void = () => void 0
async function listenToScanProgress() {
	scanProgressUnlisten()
	scanProgressUnlisten = await listen("projects_db_scan_progress", (e: ScanProgressEvent) => {
		console.log(e.payload)
		const {
			images_scanned,
			images_total,
			project_path: path,
			projects_scanned,
			projects_total,
		} = e.payload

		if (path) {
			const project = state.projects.find((p) => p.path === path)
			if (project) project.image_count = images_scanned
		}

		if (state.scanningProject !== path) {
			if (projects_scanned === 0) state.totalThisRun = 0
			state.totalThisRun += images_total

			state.scanningProject = path
		}

		const currentScanned = state.totalThisRun - images_total + images_scanned
		const avgTotalPerProject = state.totalThisRun / (projects_scanned + 1)
		const estimatedTotal = avgTotalPerProject * projects_total

		const progress = Math.round((currentScanned / estimatedTotal) * 100)
		state.scanProgress = progress
	})
}

function unlistenToScanProgress() {
	scanProgressUnlisten()
	scanProgressUnlisten = () => void 0
}

export const state = proxy({
	projects: [] as DTProject[],
	items: [] as DTImage[],
	itemDetails: {} as Record<number, TensorHistory>,
	thumbs: {} as Record<number, string>,
	scanProgress: -1,
	scanningProject: "",
	totalThisRun: 0,
	selectedProject: null as DTProject | null,
	expandedItems: {} as Record<number, boolean>,
	searchInput: "",
})

export type ProjectDataStateType = typeof state

export async function addProject(directory = false) {
	const result = await open({
		multiple: !directory,
		directory,
		defaultPath: "/Users/kcjer/Library/Containers/com.liuliu.draw-things/Data/Documents",
		filters: [
			{
				name: "Draw Things Projects",
				extensions: ["sqlite3"],
			},
		],
	})

	if (!result) return
	const files: string[] = []

	if (directory) {
		const dirFiles = (await readDir(result)).filter((f) => f.name.endsWith(".sqlite3"))
		files.push(...(await Promise.all(dirFiles.map(async (f) => await path.join(result, f.name)))))
	} else if (Array.isArray(result)) {
		for (const file of result) {
			files.push(file)
		}
	}

	for (const file of files) {
		await invoke("projects_db_add_project", { path: file })
	}

	await loadProjects()
}

export async function scanProject(projectFile: string) {
	await invoke("projects_db_scan_project", { path: projectFile })
	await loadProjects()
}

export async function scanAllProjects() {
	const start = Date.now()
	await invoke("projects_db_scan_all_projects")
	const end = Date.now()
	await loadProjects()
	state.scanProgress = -1
	console.log({ end, start }, end - start)
}

export async function removeProject(projectFile: string) {
	await invoke("projects_db_remove_project", { path: projectFile })
	await loadProjects()
}

export async function loadProjects() {
	const projects = (await invoke("projects_db_list_projects")) as DTProject[]
	console.log(projects)
	state.projects = projects.sort(projectSorter) as DTProject[]
}

function projectSorter(a: DTProject, b: DTProject) {
	return a.path.toLowerCase().localeCompare(b.path.toLowerCase())
}

export async function selectProject(path: Pick<DTProject, "project_id">) {
	const project = state.projects.find((p) => p.project_id === path.project_id) ?? null
	state.selectedProject = project

	if (!project) return

	const items = await listImages({ projectId: project.project_id, take: null })
	console.log(items)
	state.items = items as TensorHistory[]
	state.itemDetails = proxy({})

	// if (projectData.selectedProject) {
	// 	const items = await invoke("dt_project_get_tensor_history", {
	// 		projectFile: projectData.selectedProject.path,
	// 		index: 0,
	// 		count: 50,
	// 	})
	// 	console.log(items)
	// 	projectData.items.push(...items.filter(i => i.generated) as TensorHistory[])

	// 	projectData.items.forEach(async (item) => {
	// 		if (item.clip_id !== -1) return
	// 		const thumb = await invoke("dt_project_get_thumb_half", {
	// 			projectFile: projectData.selectedProject.path,
	// 			thumbId: item.image_id,
	// 		})

	// 		if (thumb) projectData.thumbs[item.image_id] = extractJpegDataUrl(new Uint8Array(thumb))
	// 	})
	// }
}

type ListImagesOpts = {
	projectId?: number
	sort?: "date"
	direction?: "asc" | "desc"
	model?: "string"
	promptSearch?: string
	take?: number
	skip?: number
}
async function listImages(opts) {
	return await invoke("projects_db_list_images", opts)
}

function toDataUrl(uint8Array: Uint8Array, mime = "image/jpeg") {
	const b64 = btoa(String.fromCharCode(...uint8Array))
	return `data:${mime};base64,${b64}`
}

function findJpegStart(data: Uint8Array): number {
	for (let i = 0; i < data.length - 1; i++) {
		if (data[i] === 0xff && data[i + 1] === 0xd8) {
			return i // Found JPEG SOI marker
		}
	}
	return -1 // Not found
}

function findJpegEnd(data: Uint8Array, start = 0): number {
	for (let i = start; i < data.length - 1; i++) {
		if (data[i] === 0xff && data[i + 1] === 0xd9) {
			return i + 2 // Include EOI marker
		}
	}
	return data.length
}

function extractJpegDataUrl(data: Uint8Array): string | null {
	const start = findJpegStart(data)
	if (start === -1) return null

	const end = findJpegEnd(data, start)
	const jpegBytes = data.subarray(start, end)

	// Convert to Base64
	let binary = ""
	const chunkSize = 0x8000
	for (let i = 0; i < jpegBytes.length; i += chunkSize) {
		binary += String.fromCharCode.apply(null, jpegBytes.subarray(i, i + chunkSize) as any)
	}
	const b64 = btoa(binary)
	return `data:image/jpeg;base64,${b64}`
}

export async function selectItem(index: number) {
	if (state.expandedItems[index]) {
		delete state.expandedItems[index]
		return
	}
	const item = state.items[index]
	const project = state.projects.find((p) => p.project_id === item.project_id)

	state.expandedItems[index] = true
	const history = (await invoke("dt_project_get_history_full", {
		projectFile: project.path,
		skip: state.items[index].row_id,
		take: 1,
	})) as TensorHistory[]

	console.log(state.items[index].row_id, history)

	state.itemDetails[index] = history[0]
}

export async function search(term: string) {
	await invoke("projects_db_find_images", { promptSearch: term }).then((r) => {
		state.items = r
	})
}

const DTProjectsStore = {
	listenToScanProgress,
	unlistenToScanProgress,
	state
}

export default DTProjectsStore