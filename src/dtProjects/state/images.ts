import { EventEmitter } from "eventemitter3"
import { proxy } from "valtio"
import { watch } from "valtio/utils"
import { type ImageExtra, pdb } from "@/commands"
import { DTPStateController } from "@/dtProjects/state/StateController"
import type { PagedItemSource } from "@/utils/pagedItemSourceF"
import type { ImagesSource } from "../types"
import type { ProjectState, ProjectsControllerState } from "./projects"
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

	private emitter = new EventEmitter<"imagesChanged">()
	get onImagesChanged() {
		return {
			on: (fn: () => void) => this.emitter.on("imagesChanged", fn),
			off: (fn: () => void) => this.emitter.off("imagesChanged", fn),
		}
	}

	constructor() {
		super("images")

		this.getFutureService("projects").then((projectsService) => {
			watch((get) => {
				const p = get(projectsService.state.selectedProjects)
				this.setSelectedProjects(p)
			})
			watch((get) => {
				const p = get(projectsService.state.projects)
				const changed = updateProjectsCache(p, this.projectsCache)
				if (changed.length > 0) this.emitter.emit("imagesChanged")
			})
		})

		watch(
			(get) => {
				const source = get(this.state.imageSource)
				this.refreshImageCounts()
			},
			{ sync: false },
		)
	}

	projectsCache: Record<number, number> = {}
	unwatch?: () => void

	// async updateItemSource(incrementSearchId = true, reason?: string) {
	// 	console.log("updateItemSource", reason)
	// 	await this.refreshImageCounts()

	// 	this.state.itemSource = pagedItemSource<ImageExtra>(
	// 		async (skip, take) => {
	// 			const res = await pdb.listImages(this.state.imageSource, skip, take)
	// 			return res.items
	// 		},
	// 		this.state.selectedProjectsCount ?? 0,
	// 		250,
	// 	)
	// 	// if (incrementSearchId)
	// 	this.state.searchId++
	// }

	toggleSortDirection() {
		if (!this.state.imageSource) return
		if (this.state.imageSource?.direction === "asc") this.state.imageSource.direction = "desc"
		else this.state.imageSource.direction = "asc"
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
			? this.state.imageSource.projectIds?.reduce(
					(acc, p) => acc + (projectCounts[p] ?? 0),
					0,
				)
			: total
		this.state.totalImageCount = total
	}

	override dispose() {
		super.dispose()
		this.unwatch?.()
	}
}

export default ImagesController

/** updates a projects cache in place and returns a list of project ids where the count has changed */
function updateProjectsCache(
	projects: ProjectsControllerState["projects"],
	cache: Record<number, number>,
) {
	const projectsChanged: number[] = []

	const visited: Record<number, number | null> = { ...cache }
	for (const project of projects) {
		visited[project.id] = null
		if (cache[project.id] !== project.image_count) {
			projectsChanged.push(project.id)
			cache[project.id] = project.image_count
		}
	}

	for (const key in visited) {
		if (visited[key] !== null) {
			delete cache[key]
			projectsChanged.push(Number(key))
		}
	}

	return projectsChanged
}
