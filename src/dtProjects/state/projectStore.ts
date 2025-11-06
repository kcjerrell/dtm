import { proxy } from "valtio"
import type { DTImage, DTProject, ScanProgressEvent, TensorHistoryExtra } from "../types"
import { listen } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"
import { loadWatchFolders } from './watchFolders'
import { loadProjects } from './projects'

const state = proxy({
	projects: [] as DTProject[],
	watchFolders: [] as string[],
	items: [] as DTImage[],
	itemDetails: {} as Record<number, TensorHistoryExtra>,
	scanProgress: -1,
	scanningProject: "",
	totalThisRun: 0,
	selectedProject: null as DTProject | null,
	expandedItems: {} as Record<number, boolean>,
	searchInput: "",
})

async function init() {
	await attachListeners()
  await loadWatchFolders()
  await loadProjects()
}

let scanProgressUnlisten: () => void = () => undefined
async function attachListeners() {
	scanProgressUnlisten()

	let scanningProject: DTProject | null = null
	scanProgressUnlisten = await listen("projects_db_scan_progress", (e: ScanProgressEvent) => {
		console.log(e.payload)
		const {
			images_scanned,
			images_total,
			project_path: path,
			projects_scanned,
			projects_total,
		} = e.payload

		if (path && path !== state.scanningProject) {
			if (scanningProject !== null) {
				scanningProject.scanningStatus = "scanned"
			}

			const project = state.projects.find((p) => p.path === path)
			if (project) {
				project.scanningStatus = "scanning"
				scanningProject = project
			}

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

function removeListeners() {
	scanProgressUnlisten()
	scanProgressUnlisten = () => undefined
}

const DTProjects = {
	state,
	loadProjects,
	removeListeners,
  init,
}

export default DTProjects
