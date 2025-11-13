import { listen } from "@tauri-apps/api/event"
import { proxy, ref, useSnapshot } from "valtio"
import {
	dtProject,
	type ImageExtra,
	type ListImagesOptions,
	type ProjectExtra,
	type TensorHistoryExtra
} from "@/commands"
import type { ScanProgressEvent } from "../types"
import ProjectService, { type ProjectState } from "./projects"
import { ScannerService } from './scanner'
import WatchFolderService, { type WatchFolderType } from "./watchFolders"

const state = proxy({
	projects: [] as ProjectState[],
	watchFolders: [] as WatchFolderType[],
	imageSource: null as ImagesSource | null,
	items: [] as ImageExtra[],
	itemDetails: {} as Record<number, TensorHistoryExtra>,
	scanProgress: -1,
	scanningProject: "",
	totalThisRun: 0,
	selectedProject: null as ProjectExtra | null,
	expandedItems: {} as Record<number, boolean>,
	searchInput: "",
	detailsOverlay: {
		item: null as ImageExtra | null,
		lastItem: null as ImageExtra | null,
		// sourceElement: ref(null as unknown as HTMLImageElement),
		candidates: [] as TensorHistoryExtra[],
		sourceRect: null as DOMRect | null,
		width: 0,
		height: 0,
	},
	services: ref({} as ServicesType)
})

export type DTProjectsState = typeof state

export const WatchFolders = new WatchFolderService(state)
export const Projects = new ProjectService(state)
export const Scanner = new ScannerService(state)

state.services.WatchFolders = WatchFolders
state.services.Projects = Projects
state.services.Scanner = Scanner

type ServicesType = {
	WatchFolders: WatchFolderService
	Projects: ProjectService
	Scanner: ScannerService
}

async function init() {
	await attachListeners()
	await WatchFolders.loadWatchFolders()
	await Projects.loadProjects()

	const knownProjects = state.projects.reduce(
		(acc, p) => {
			acc[p.path] = false
			return acc
		},
		{} as Record<string, boolean>,
	)

	for (const folder of state.watchFolders) {
		const folderProjects = await Scanner.scanFolder(folder)
		for (const fp of folderProjects) {
			if (fp in knownProjects) continue
			knownProjects[fp] = true
		}
	}

	const newProjects = Object.entries(knownProjects)
		.filter(([_k, v]) => v)
		.map(([k]) => k)
	await Projects.addProjects(newProjects)

	// await projectsDb.scanAllProjects()
}

let scanProgressUnlisten: () => void = () => undefined
async function attachListeners() {
	scanProgressUnlisten()

	let scanningProject: ProjectExtra | null = null
	scanProgressUnlisten = await listen("projects_db_scan_progress", (e: ScanProgressEvent) => {
		console.log(e.payload)
		const {
			images_scanned,
			images_total,
			project_final,
			project_path: path,
			projects_scanned,
			projects_total,
		} = e.payload

		if (project_final >= 0) {
			const project = state.projects.find((p) => p.path === path)
			if (project) {
				project.image_count = project_final
				project.isScanning = false
				scanningProject = null
			}
			return
		}

		// if project_path has changed from previous event
		if (path && path !== state.scanningProject) {
			const project = state.projects.find((p) => p.path === path)
			if (project) {
				project.isScanning = true
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

export function removeListeners() {
	scanProgressUnlisten()
	scanProgressUnlisten = () => undefined
}

export type ImagesSource = {
	projects?: ProjectExtra[]
	search?: unknown
	filter?: unknown
}

export async function setImagesSource(source: ImagesSource) {
	if (JSON.stringify(source) === JSON.stringify(state.imageSource)) return
	state.imageSource = source
}

export function showDetailsOverlay(item: ImageExtra, sourceElement: HTMLImageElement) {
	state.detailsOverlay.item = item
	state.detailsOverlay.lastItem = item

	state.detailsOverlay.sourceRect = toJSON(sourceElement.getBoundingClientRect())
	state.detailsOverlay.width = sourceElement.naturalWidth
	state.detailsOverlay.height = sourceElement.naturalHeight

	loadDetails(item)
}

export function hideDetailsOverlay() {
	state.detailsOverlay.item = null
	state.detailsOverlay.candidates = []
}

async function loadDetails(item: ImageExtra) {
	// await new Promise((res) => setTimeout(res, 500))
	const project = state.projects.find((p) => p.id === item.project_id)
	if (!project) return
	console.log(toJSON(item))
	const history = await dtProject.getHistoryFull(project.path, item.node_id)

	state.itemDetails[item.node_id] = history
	console.log(history.lineage, history.logical_time)
	state.detailsOverlay.candidates = await dtProject.getPredecessorCandidates(
		project.path,
		history.row_id,
		history.lineage,
		history.logical_time,
	)
}

export const DTProjects = {
	state,
	removeListeners,
	init,
	setImagesSource,
	showDetailsOverlay,
	hideDetailsOverlay,
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
			projectIds: imagesSource.projects.map((p) => p.id),
		}
	}
}

export async function selectItem(item: ImageExtra) {
	if (state.expandedItems[item.node_id]) {
		delete state.expandedItems[item.node_id]
		return
	}

	state.expandedItems[item.node_id] = true

	const project = state.projects.find((p) => p.id === item.project_id)
	if (!project) return
	console.log(toJSON(item))
	const history = await dtProject.getHistoryFull(project.path, item.node_id)

	state.itemDetails[item.node_id] = history
}

export default DTProjects
