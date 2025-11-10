import { proxy, useSnapshot } from "valtio"
import type { DTProject, ScanProgressEvent, TensorHistoryExtra } from "../types"
import { listen } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"
import { addWatchFolder, loadWatchFolders, scanFolder } from "./watchFolders"
import { addProjects, checkProjects, loadProjects } from "./projects"
import { ImageExtra, ListImagesOptions, projectsDb } from "@/commands"

const state = proxy({
	projects: [] as DTProject[],
	watchFolders: [] as string[],
	imageSource: null as ImagesSource | null,
	items: [] as ImageExtra[],
	itemDetails: {} as Record<number, TensorHistoryExtra>,
	scanProgress: -1,
	scanningProject: "",
	totalThisRun: 0,
	selectedProject: null as DTProject | null,
	expandedItems: {} as Record<number, boolean>,
	searchInput: "",
})

export type DTProjectsState = typeof state

async function init() {
	await attachListeners()
	await loadWatchFolders()
	await loadProjects()

	const knownProjects = state.projects.reduce(
		(acc, p) => {
			acc[p.path] = false
			return acc
		},
		{} as Record<string, boolean>,
	)

	for (const folder of state.watchFolders) {
		const folderProjects = await scanFolder(folder)
		for (const fp of folderProjects) {
			if (fp in knownProjects) continue
			knownProjects[fp] = true
		}
	}

	const newProjects = Object.entries(knownProjects)
		.filter(([_k, v]) => v)
		.map(([k]) => k)
	await addProjects(newProjects)

	// await projectsDb.scanAllProjects()
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

type ImagesSource = {
	projects?: DTProject[]
	search?: unknown
	filter?: unknown
}

async function setImagesSource(source: ImagesSource) {
	if (JSON.stringify(source) === JSON.stringify(state.imageSource)) return
	state.imageSource = source
}

const DTProjects = {
	state,
	loadProjects,
	removeListeners,
	init,
	setImagesSource,
}

export function useDTProjects() {
	const snap = useSnapshot(DTProjects.state)
	return {
		snap,
		...DTProjects,
	}
}

export function getRequestOpts(imagesSource: ImagesSource): ListImagesOptions | undefined {
	console.log(imagesSource)
	if (imagesSource.projects) {
		return {
			projectIds: imagesSource.projects.map((p) => p.project_id),
		}
	}
}

export default DTProjects
