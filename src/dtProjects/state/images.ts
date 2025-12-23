import { proxy, subscribe, useSnapshot } from "valtio"
import { type ImageExtra, pdb } from "@/commands"
import { DTPStateController } from "@/hooks/StateController"
import { type PagedItemSource, pagedItemSource } from "@/utils/pagedItemSourceF"
import type { ImagesSource } from "../types"
import type { ProjectState } from "./projects"
import type { BackendFilter } from "./search"

export type ImagesControllerState = {
	imageSource: ImagesSource
	totalImageCount?: number
	selectedProjectsCount?: number
	projectImageCounts?: Record<number, number>
	imageSize?: number
	itemSource?: PagedItemSource<ImageExtra>
	searchId: number
}

class ImagesController extends DTPStateController<ImagesControllerState> {
	state = proxy<ImagesControllerState>({
		imageSource: { projectIds: [], direction: "desc", sort: "wall_clock" },
		totalImageCount: undefined,
		selectedProjectsCount: undefined,
		projectImageCounts: undefined,
		imageSize: undefined,
		itemSource: undefined,
		searchId: 0,
	})

	constructor() {
		super()

		subscribe(this.state.imageSource, async () => {
			await this.updateItemSource()
		})

		this.updateItemSource()
	}

	async updateItemSource() {
		await this.refreshImageCounts()

		this.state.itemSource = pagedItemSource<ImageExtra>(
			async (skip, take) => {
				const res = await pdb.listImages(this.state.imageSource, skip, take)
				return res.items
			},
			this.state.selectedProjectsCount ?? 0,
			250,
		)
		this.state.searchId++
	}

	toggleSortDirection() {
		if (!this.state.imageSource) return
		if (this.state.imageSource?.direction === "asc") this.state.imageSource.direction = "desc"
		else this.state.imageSource.direction = "asc"
	}

	useItemSource(): PagedItemSource<ImageExtra> {
		return useSnapshot(this.state).itemSource as PagedItemSource<ImageExtra>
	}

	onImageCountsChanged: (counts: Record<number, number>) => void = () => {
		console.warn("Images may be out of sync, handler not assigned")
	}

	async setSearchFilter(searchText?: string, filter?: BackendFilter[]) {
		this.state.imageSource.search = searchText
		this.state.imageSource.filters = filter?.map((f) => ({
			target: f.target.toLowerCase(),
			operator: f.operator,
			value: f.value,
		}))
	}

	async setSelectedProjects(projects: ProjectState[]) {
		this.state.imageSource.projectIds = projects.map((p) => p.id)
	}

	async refreshImageCounts() {
		const { total, counts } = await pdb.listImagesCount(this.state.imageSource)
		const projectCounts = {} as Record<string, number>
		for (const count of counts) {
			projectCounts[count.project_id] = count.count
		}

		this.state.projectImageCounts = projectCounts
		this.state.selectedProjectsCount = this.state.imageSource.projectIds?.length
			? this.state.imageSource.projectIds?.reduce((acc, p) => acc + (projectCounts[p] ?? 0), 0)
			: total
		this.state.totalImageCount = total
		this.onImageCountsChanged(projectCounts)
	}
}

export default ImagesController
