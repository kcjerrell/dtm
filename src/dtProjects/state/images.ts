import { proxy, Snapshot, subscribe, useSnapshot } from "valtio"
import { type ImageExtra, pdb } from "@/commands"
import { DTPStateController } from "@/hooks/StateController"
import type { ImagesSource } from "../types"
import type { ProjectState } from "./projects"
import type { BackendFilter } from "./search"
import { PagedItem, pagedItemSource, PagedItemSource } from "@/utils/pagedItemSourceF"

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
		imageSource: { projectIds: [] },
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
			console.log("imagesource changed")
			this.state.searchId++
			await this.refreshImageCounts()

			this.state.itemSource = pagedItemSource<ImageExtra>(
				async (skip, take) => {
					const res = await pdb.listImages(this.state.imageSource, skip, take)
					return res.items
				},
				this.state.selectedProjectsCount ?? 0,
				250,
			)
		})
	}

	useItemSource(): Snapshot<PagedItemSource<ImageExtra>> | undefined {
		return useSnapshot(this.state).itemSource
	}

	onImageCountsChanged: (counts: Record<number, number>) => void = () => {
		console.warn("Images may be out of sync, handler not assigned")
	}

	async setSearchFilter(searchText?: string, filter?: BackendFilter[]) {
		this.state.imageSource.search = searchText
		this.state.imageSource.filters = filter
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
