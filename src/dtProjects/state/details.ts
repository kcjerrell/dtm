import { type DTImageFull, dtProject, type ImageExtra } from "@/commands"
import { DTPStateService } from "@/dtProjects/state/StateController"
import { extractConfigFromTensorHistoryNode, groupConfigProperties } from "@/utils/config"
import type ProjectsController from "./projects"

class DetailsService extends DTPStateService {
	projects: ProjectsController
	itemDetails: Record<string, DTImageFull> = {}

	constructor(projects: ProjectsController) {
		super("details")
		this.projects = projects
	}

	async getDetails(item: ImageExtra): Promise<DTImageFull | undefined> {
		const key = detailsKey(item.project_id, item.node_id)
		console.log("Let's get some deets for ", key)
		if (this.itemDetails[key]) return this.itemDetails[key]
		const project = this.projects.state.projects.find((p) => p.id === item.project_id)
		if (!project) return

		const { history, ...extra } = await dtProject.getHistoryFull(project.path, item.node_id)
		const rawConfig = extractConfigFromTensorHistoryNode(history) ?? {}
		const config = groupConfigProperties(rawConfig)

		const full: Partial<DTImageFull> = {
			id: item.node_id,
			prompt: history.text_prompt,
			negativePrompt: history.negative_text_prompt,
			project,
			config: rawConfig,
			groupedConfig: config,
			node: history,
			images: {
				tensorId: extra.tensor_id,
				previewId: history.preview_id,
				maskId: extra.mask_id,
				depthMapId: extra.depth_map_id,
				scribbleId: extra.scribble_id,
				poseId: extra.pose_id,
				colorPaletteId: extra.color_palette_id,
				customId: extra.custom_id,
				moodboardIds: extra.moodboard_ids,
			},
		}

		this.itemDetails[key] = full as DTImageFull
		console.log(full)
		return full as DTImageFull
	}

	async getPredecessorCandidates(item: ImageExtra) {
		const project = this.projects.state.projects.find((p) => p.id === item.project_id)
		if (!project) return

		const history = await this.getDetails(item)
		if (!history) return

		return await dtProject.getPredecessorCandidates(
			project.path,
			item.node_id,
			history.node.lineage,
			history.node.logical_time,
		)
	}
}

function detailsKey(projectId: number, nodeId: number) {
	return `${projectId}-${nodeId}`
}

export default DetailsService
