import { listen } from "@tauri-apps/api/event"
import { proxy, ref, type Snapshot, snapshot, subscribe, useSnapshot } from "valtio"
import {
	dtProject,
	type ImageExtra,
	type Model,
	type ProjectExtra,
	pdb,
	type TensorHistoryExtra,
} from "@/commands"
import urls from "@/commands/urls"
import { uint8ArrayToBase64 } from "@/utils/helpers"
import { getVersionLabel } from "@/utils/models"
import { drawPose, pointsToPose, tensorToPoints } from "@/utils/pose"
import type { ImagesSource, ScanProgressEvent } from "../types"
import ProjectsService, { type ProjectState } from "./projects"
import { ScannerService } from "./scanner"
import { type BackendFilter, SearchService, type SearchState } from "./search"
import WatchFolderService, { type WatchFolderServiceState } from "./watchFolders"

export type DTProjectsStateType = {
	projects: ProjectState[]
	watchFolders: WatchFolderServiceState

	imageSource: ImagesSource | null
	items: ImageExtra[]
	itemDetails: Record<number, TensorHistoryExtra>

	scanProgress: number
	scanningProject: string
	totalThisRun: number
	selectedProject: ProjectExtra | null

	searchInput: string
	search: SearchState

	itemSize: number

	detailsOverlay: {
		item: ImageExtra | null
		subItem: null | {
			projectId: number
			tensorId: string
			thumbUrl: string
			url?: string
			width?: number
			height?: number
			isLoading: boolean
			sourceElement?: HTMLElement
		}
		subItemSourceRect: DOMRect | null
		lastItem: ImageExtra | null
		candidates: TensorHistoryExtra[]
		sourceRect: DOMRect | null
		width: number
		height: number
	}
	models: {
		models: Model[]
		loras: Model[]
		controls: Model[]
		versions: Record<string, { models: number; controls: number; loras: number }>
	}
}

const state = proxy({
	projects: [] as ProjectState[],
	watchFolders: {} as WatchFolderServiceState,
	imageSource: { projectIds: [] } as ImagesSource,
	items: [] as ImageExtra[],
	itemDetails: {} as Record<number, TensorHistoryExtra>,
	scanProgress: -1,
	scanningProject: "",
	totalThisRun: 0,
	selectedProject: null as ProjectExtra | null,
	searchInput: "",
	search: {} as SearchState,
	itemSize: 200,
	detailsOverlay: {
		item: null as ImageExtra | null,
		subItem: null as DTProjectsStateType["detailsOverlay"]["subItem"],
		subItemSourceRect: null as DOMRect | null,
		lastItem: null as ImageExtra | null,
		candidates: [] as TensorHistoryExtra[],
		sourceRect: null as DOMRect | null,
		width: 0,
		height: 0,
	},
	models: {
		models: [],
		loras: [],
		controls: [],
		versions: {},
	},
}) as DTProjectsStateType

export type IDTProjectsStore = DTProjectsStore

class DTProjectsStore {
	state: DTProjectsStateType
	projects: ProjectsService
	watchFolders: WatchFolderService
	scanner: ScannerService
	search: SearchService

	#initialized = false

	constructor() {
		this.state = state
		this.projects = new ProjectsService(this)
		this.scanner = new ScannerService(this)

		this.search = new SearchService(this)
		this.state.search = this.search.state

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

	showDetailsOverlay(item: ImageExtra, sourceElement?: HTMLImageElement) {
		const detailsOverlay = this.state.detailsOverlay
		detailsOverlay.item = item
		detailsOverlay.lastItem = item

		if (sourceElement) {
			detailsOverlay.sourceRect = toJSON(sourceElement.getBoundingClientRect())
			detailsOverlay.width = sourceElement.naturalWidth
			detailsOverlay.height = sourceElement.naturalHeight
		}

		this.loadDetails(item)
	}

	hideDetailsOverlay() {
		const detailsOverlay = this.state.detailsOverlay
		detailsOverlay.item = null
		detailsOverlay.candidates = []
		detailsOverlay.subItem = null
	}

	async loadDetails(item: ImageExtra) {
		// await new Promise((res) => setTimeout(res, 500))
		const project = this.state.projects.find((p) => p.id === item.project_id)
		if (!project) return
		const history = await dtProject.getHistoryFull(project.path, item.node_id)

		this.state.itemDetails[item.node_id] = history
		this.state.detailsOverlay.candidates = await dtProject.getPredecessorCandidates(
			project.path,
			history.row_id,
			history.lineage,
			history.logical_time,
		)
	}

	async showSubItem(projectId: number, tensorId: string, sourceElement: HTMLElement) {
		const details = this.state.detailsOverlay
		if (!details.item) return
		details.subItem = {
			projectId,
			tensorId,
			thumbUrl: urls.tensor(projectId, tensorId, null, 100),
			isLoading: true,
			sourceElement: ref(sourceElement),
		}
		details.subItemSourceRect = toJSON(sourceElement.getBoundingClientRect())
		if (tensorId?.startsWith("pose")) await this.showSubItemPose(projectId, tensorId)
		else await this.showSubItemImage(projectId, tensorId)
	}

	async showSubItemPose(projectId: number, tensorId: string) {
		const poseData = await dtProject.decodeTensor(projectId, tensorId, false)
		const points = tensorToPoints(poseData)
		const pose = pointsToPose(points, 1024, 1024)
		const image = await drawPose(pose, 4)
		const details = this.state.detailsOverlay
		if (!image || !details.item) return
		if (details.subItem) {
			details.subItem.url = `data:image/png;base64,${await uint8ArrayToBase64(image)}`
			details.subItem.isLoading = false
			details.subItem.width = 1024
			details.subItem.height = 1024
		}
	}

	async showSubItemImage(projectId: number, tensorId: string) {
		const size = await dtProject.getTensorSize(projectId, tensorId)
		const loadImg = new Image()
		loadImg.onload = () => {
			const details = this.state.detailsOverlay
			if (!details.item) return
			if (details.subItem) {
				details.subItem.url = urls.tensor(projectId, tensorId)
				details.subItem.isLoading = false
				details.subItem.width = size.width
				details.subItem.height = size.height
			}
		}
		loadImg.src = urls.tensor(projectId, tensorId)
	}

	hideSubItem() {
		this.state.detailsOverlay.subItem = null
	}

	async listModels() {
		const models = await pdb.listModels()

		const versions = {
			"": { models: 0, controls: 0, loras: 0, label: "Unknown" },
		} as Record<string, { models: number; controls: number; loras: number; label?: string }>

		for (const model of models) {
			const version = model.version ?? ""
			if (!versions[version])
				versions[version] = { models: 0, controls: 0, loras: 0, label: getVersionLabel(version) }
			if (model.model_type === "Model") versions[version].models++
			else if (model.model_type === "Lora") versions[version].loras++
			else if (model.model_type === "Cnet") versions[version].controls++
		}

		this.state.models = {
			models: models.filter((it) => it.model_type === "Model"),
			loras: models.filter((it) => it.model_type === "Lora"),
			controls: models.filter((it) => it.model_type === "Cnet"),
			versions,
		}
	}

	setSearchFilter(searchText?: string, filter?: BackendFilter[]) {
		this.state.imageSource.search = searchText
		this.state.imageSource.filters = filter
	}

	setProjectsFilter(projectIds: number[]) {
		this.state.imageSource.projectIds = projectIds
	}
}

const store = new DTProjectsStore()

let scanProgressUnlisten: () => void = () => undefined
async function attachListeners() {
	scanProgressUnlisten()

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
			}
			return
		}

		// if project_path has changed from previous event
		if (path && path !== state.scanningProject) {
			const project = state.projects.find((p) => p.path === path)
			if (project) {
				project.isScanning = true
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


export async function setImagesSource(source: ImagesSource) {
	if (JSON.stringify(source) === JSON.stringify(state.imageSource)) return
	state.imageSource = source
}

export const DTProjects = {
	store,
	state,
	setImagesSource,
}

export function useDTProjects() {
	const snap = useSnapshot(store.state) as Snapshot<DTProjectsStateType>
	return {
		snap,
		...DTProjects,
	}
}

export function useProjectsSummary() {
	const { snap } = useDTProjects()
	return {
		totalProjects: snap.projects.length,
		totalImages: snap.projects.reduce((acc, p) => acc + p.image_count, 0),
		totalSize: snap.projects.reduce((acc, p) => acc + p.filesize, 0),
	}
}

export default DTProjects

let _devUpdate: ReturnType<typeof setTimeout> | null = null
if (import.meta.env.DEV) {
	const devStore = await import("@/Dev.tsx")
	subscribe(store.state, () => {
		if (_devUpdate) clearTimeout(_devUpdate)
		_devUpdate = setTimeout(() => {
			const update = snapshot(state)
			// this is a work around since elements can't be serialized
			if (update.detailsOverlay.subItem?.sourceElement)
				// @ts-ignore
				delete update.detailsOverlay.subItem.sourceElement
			devStore.updateDevState("projects", update)
			_devUpdate = null
		}, 200)
	})
}
