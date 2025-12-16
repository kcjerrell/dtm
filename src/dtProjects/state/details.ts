import { dtProject, type ImageExtra, type TensorHistoryExtra } from "@/commands"
import { DTPStateService } from '@/hooks/StateController'
import type ProjectsController from "./projects"

class DetailsService extends DTPStateService {
	projects: ProjectsController
	itemDetails: Record<string, TensorHistoryExtra> = {}

	constructor(projects: ProjectsController) {
		super()
		this.projects = projects
	}

	async getDetails(item: ImageExtra) {
		const key = detailsKey(item.project_id, item.node_id)
		if (this.itemDetails[key]) return this.itemDetails[key]
		const project = this.projects.state.projects.find((p) => p.id === item.project_id)
		if (!project) return

		const history = await dtProject.getHistoryFull(project.path, item.node_id)
		this.itemDetails[key] = history
		return history
	}

	async getPredecessorCandidates(item: ImageExtra) {
		const project = this.projects.state.projects.find((p) => p.id === item.project_id)
		if (!project) return

		const history = await this.getDetails(item)
		if (!history) return

		return await dtProject.getPredecessorCandidates(
			project.path,
			item.node_id,
			history.lineage,
			history.logical_time,
		)
	}
}

function detailsKey(projectId: number, nodeId: number) {
	return `${projectId}-${nodeId}`
}

export default DetailsService
