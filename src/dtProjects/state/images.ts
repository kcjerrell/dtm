import { proxy } from "valtio"
import { pdb } from "@/commands"
import { DTPStateController } from "@/hooks/StateController"
import type { ImagesSource } from "../types"
import type { ProjectState } from './projects'
import type { BackendFilter } from "./search"

export type ImagesControllerState = {
	imageSource: ImagesSource
	imageSourceTotal?: number
	imageSourceCounts?: Record<number, number>
	imageSize?: number
}

class ImagesController extends DTPStateController<ImagesControllerState> {
	state = proxy<ImagesControllerState>({
		imageSource: { projectIds: [] },
		imageSourceTotal: undefined,
		imageSourceCounts: undefined,
		imageSize: undefined,
	})

	onImageCountsChanged: (counts: Record<number, number>) => void = () => {
		console.warn("Images may be out of sync, handler not assigned")
	}

	async setSearchFilter(searchText?: string, filter?: BackendFilter[]) {
		this.state.imageSource.search = searchText
		this.state.imageSource.filters = filter

		await this.refreshImageCounts()
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

		this.state.imageSourceCounts = projectCounts
		this.onImageCountsChanged(projectCounts)
	}
}

export default ImagesController
