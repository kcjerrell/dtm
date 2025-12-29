import { proxy, ref, useSnapshot } from "valtio"
import { type DTImageFull, dtProject, type ImageExtra, type TensorHistoryExtra } from "@/commands"
import urls from "@/commands/urls"
import { DTPStateController } from "@/dtProjects/state/StateController"
import { uint8ArrayToBase64 } from "@/utils/helpers"
import { drawPose, pointsToPose, tensorToPoints } from "@/utils/pose"
import type { ProjectState } from "./projects"

export type UIControllerState = {
	selectedTab: "projects" | "search" | "settings"
	shouldFocus?: string
	projectsCount: number
	detailsView: {
		project?: ProjectState
		item?: ImageExtra
		itemDetails?: DTImageFull
		showSpinner: boolean
		subItem?: {
			projectId: number
			tensorId: string
			maskUrl?: string
			applyMask?: boolean
			thumbUrl: string
			url?: string
			width?: number
			height?: number
			isLoading: boolean
			sourceElement?: HTMLElement
		}
		subItemSourceRect?: DOMRect | null
		lastItem?: ImageExtra | null
		candidates?: TensorHistoryExtra[]
		sourceRect?: DOMRect | null
		width?: number
		height?: number
	}
}

type Handler<T> = (payload: T) => void

export class UIController extends DTPStateController<UIControllerState> {
	state = proxy<UIControllerState>({
		selectedTab: "projects",
		shouldFocus: undefined,
		projectsCount: 0,
		detailsView: {
			showSpinner: false,
			item: undefined,
			itemDetails: undefined,
			subItem: undefined,
			subItemSourceRect: null,
			lastItem: undefined,
			candidates: [],
			sourceRect: null,
			width: 0,
			height: 0,
		},
	})

	constructor() {
		super("uiState")
	}

	onItemChanged: Handler<{ item: ImageExtra | null }>[] = []
	onSubItemChanged: Handler<{ projectId: number; tensorId: string }>[] = []

	raise<T>(event: "onItemChanged" | "onSubItemChanged", payload: T) {
		const handlers = this[event] as Handler<T>[]
		if (!handlers || !handlers.length) {
			console.warn(`No handlers for event ${event}`)
			return
		}
		for (const handler of handlers) {
			handler(payload)
		}
	}

	setSelectedTab(tab: "projects" | "search" | "settings", focusElement?: string) {
		this.state.selectedTab = tab
		this.state.shouldFocus = focusElement
	}

	async showDetailsOverlay(item: ImageExtra, sourceElement?: HTMLImageElement) {
		const detailsOverlay = this.state.detailsView
		detailsOverlay.item = item
		detailsOverlay.lastItem = item
		detailsOverlay.project = await this.getService("projects")?.getProject(item.project_id)

		if (sourceElement) {
			detailsOverlay.sourceRect = toJSON(sourceElement.getBoundingClientRect())
			detailsOverlay.width = sourceElement.naturalWidth
			detailsOverlay.height = sourceElement.naturalHeight
		}

		const itemDetails = await this.getService("details")?.getDetails(item)
		detailsOverlay.itemDetails = itemDetails

		const candidates = await this.getService("details")?.getPredecessorCandidates(item)
		detailsOverlay.candidates = candidates ?? []

		this.raise("onItemChanged", { item })
	}

	useDetailsOverlay() {
		return useSnapshot(this.state.detailsView)
	}

	hideDetailsOverlay() {
		const detailsOverlay = this.state.detailsView
		detailsOverlay.item = undefined
		detailsOverlay.candidates = []
		detailsOverlay.subItem = undefined
		detailsOverlay.subItemSourceRect = null
		detailsOverlay.itemDetails = undefined
		detailsOverlay.sourceRect = null
		detailsOverlay.width = undefined
		detailsOverlay.height = undefined
	}

	async showSubItem(
		projectId: number,
		tensorId: string,
		sourceElement: HTMLElement,
		maskId?: string,
	) {
		const details = this.state.detailsView
		if (!details.item) return
		details.subItem = {
			projectId,
			tensorId,
			maskUrl: maskId ? urls.tensor(projectId, maskId, { invert: true }) : undefined,
			applyMask: !!maskId,
			thumbUrl: urls.tensor(projectId, tensorId, { size: 100 }),
			isLoading: true,
			sourceElement: ref(sourceElement),
		}
		details.subItemSourceRect = toJSON(sourceElement.getBoundingClientRect())
		if (tensorId?.startsWith("pose")) await this.showSubItemPose(projectId, tensorId)
		else await this.showSubItemImage(projectId, tensorId)
	}

	toggleSubItemMask() {
		const details = this.state.detailsView
		if (!details.subItem || !details.subItem.maskUrl) return
		details.subItem.applyMask = !details.subItem.applyMask
	}

	async showSubItemPose(projectId: number, tensorId: string) {
		const poseData = await dtProject.decodeTensor(projectId, tensorId, false)
		const points = tensorToPoints(poseData)
		const pose = pointsToPose(points, 1024, 1024)
		const image = await drawPose(pose, 4)
		const details = this.state.detailsView
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
			const details = this.state.detailsView
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
		this.state.detailsView.subItem = undefined
	}

	callWithSpinner<T>(fn: () => Promise<T>) {
		this.state.detailsView.showSpinner = true
		return fn().finally(() => {
			this.state.detailsView.showSpinner = false
		})
	}

	setProjectsCount(count: number) {
		this.state.projectsCount = count
		if (count === 0) this.setSelectedTab("settings")
	}
}
