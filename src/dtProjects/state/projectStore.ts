import { listen } from "@tauri-apps/api/event"
import { proxy, ref, useSnapshot } from "valtio"
import {
	dtProject,
	type ImageExtra,
	type ListImagesOptions,
	type ProjectExtra,
	type TensorHistoryExtra,
} from "@/commands"
import type { ScanProgressEvent } from "../types"
import ProjectService, { type ProjectState } from "./projects"
import { ScannerService } from "./scanner"
import WatchFolderService, { WatchFolderServiceState, type WatchFolderState } from "./watchFolders"
import ProjectsService from "./projects"

export type DTProjectsStateType = {
    projects: ProjectState[];
    watchFolders: WatchFolderServiceState;
    imageSource: ImagesSource | null;
    items: ImageExtra[];
    itemDetails: Record<number, TensorHistoryExtra>;
    scanProgress: number;
    scanningProject: string;
    totalThisRun: number;
    selectedProject: ProjectExtra | null;
    expandedItems: Record<number, boolean>;
		searchInput: string;
		itemSize: number;
    detailsOverlay: {
        item: ImageExtra | null;
        lastItem: ImageExtra | null;
        candidates: TensorHistoryExtra[];
        sourceRect: DOMRect | null;
        width: number;
        height: number;
    };
}

const state = proxy({
	projects: [] as ProjectState[],
	watchFolders: {} as WatchFolderServiceState,
	imageSource: null as ImagesSource | null,
	items: [] as ImageExtra[],
	itemDetails: {} as Record<number, TensorHistoryExtra>,
	scanProgress: -1,
	scanningProject: "",
	totalThisRun: 0,
	selectedProject: null as ProjectExtra | null,
	expandedItems: {} as Record<number, boolean>,
	searchInput: "",
	itemSize: 200,
	detailsOverlay: {
		item: null as ImageExtra | null,
		lastItem: null as ImageExtra | null,
		// sourceElement: ref(null as unknown as HTMLImageElement),
		candidates: [] as TensorHistoryExtra[],
		sourceRect: null as DOMRect | null,
		width: 0,
		height: 0,
	},
})

export interface IDTProjectsStore {
	state: DTProjectsStateType
	projects: ProjectsService
	watchFolders: WatchFolderService
	scanner: ScannerService
}
class DTProjectsStore implements IDTProjectsStore {
	state: DTProjectsStateType
	projects: ProjectsService
	watchFolders: WatchFolderService
	scanner: ScannerService

	#initialized = false

	constructor() {
		this.state = state
		this.projects = new ProjectsService(this)
		this.scanner = new ScannerService(this)

		this.watchFolders = new WatchFolderService(this)
		this.state.watchFolders = this.watchFolders.state
	}

	async init() {
		await attachListeners()

		if (!this.#initialized) {
			this.#initialized = true
			await this.watchFolders.loadWatchFolders()
			await this.projects.loadProjects()
			await this.scanner.scanAndWatch()
		}
	}

	removeListeners() {
		scanProgressUnlisten()
		scanProgressUnlisten = () => undefined
	}

	setItemSize(size: number) {
		this.state.itemSize = size
	}
}

const store = new DTProjectsStore()

let scanProgressUnlisten: () => void = () => undefined
async function attachListeners() {
	scanProgressUnlisten()

	let scanningProject: ProjectExtra | null = null
	scanProgressUnlisten = await listen("projects_db_scan_progress", (e: ScanProgressEvent) => {
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

export type ImagesSource = {
	projects?: ProjectExtra[]
	search?: string
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
	const history = await dtProject.getHistoryFull(project.path, item.node_id)

	state.itemDetails[item.node_id] = history
	state.detailsOverlay.candidates = await dtProject.getPredecessorCandidates(
		project.path,
		history.row_id,
		history.lineage,
		history.logical_time,
	)
}

export const DTProjects = {
	store,
	state,
	setImagesSource,
	showDetailsOverlay,
	hideDetailsOverlay,
}

export function useDTProjects() {
	const snap = useSnapshot(store.state)
	return {
		snap,
		...DTProjects,
	}
}

export function getRequestOpts(imagesSource: ImagesSource): ListImagesOptions | undefined {
	const opts = {} as ListImagesOptions
	if (imagesSource.projects) {
		opts.projectIds = imagesSource.projects.map((p) => p.id)
	}
	if (imagesSource.search) opts.promptSearch = imagesSource.search

	return opts
}

export async function selectItem(item: ImageExtra) {
	if (state.expandedItems[item.node_id]) {
		delete state.expandedItems[item.node_id]
		return
	}

	state.expandedItems[item.node_id] = true

	const project = state.projects.find((p) => p.id === item.project_id)
	if (!project) return
	const history = await dtProject.getHistoryFull(project.path, item.node_id)

	state.itemDetails[item.node_id] = history
}

export default DTProjects
