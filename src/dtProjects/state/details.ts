import type { DTImageFull, ImageExtra } from "@/commands"
import DTPService from "@/commands/DtpService"
import { extractConfigFromTensorHistoryNode, groupConfigProperties } from "@/utils/config"
import type ProjectsController from "./projects"
import { DTPStateService } from "./types"
import DTProject from "@/commands/DTProject"
import { TensorHistoryNode } from "@/commands/DTProjectTypes"

class DetailsService extends DTPStateService {
    projects: ProjectsController
    itemDetails: Record<string, TensorHistoryNode> = {}

    constructor(projects: ProjectsController) {
        super("details")
        this.projects = projects
    }

    async getDetails(item: ImageExtra): Promise<TensorHistoryNode | undefined> {
        if (!item.is_ready) return
        const key = detailsKey(item.project_id, item.node_id)
        if (this.itemDetails[key]) return this.itemDetails[key]
        const project = this.projects.state.projects.find((p) => p.id === item.project_id)
        if (!project) return

        const node = await DTProject.getTensorHistory(item.project_id, item.node_id)

        this.itemDetails[key] = node
        return node
    }

    async getPredecessorCandidates(item: ImageExtra) {
        return []
        const project = this.projects.state.projects.find((p) => p.id === item.project_id)
        if (!project) return

        const history = await this.getDetails(item)
        if (!history) return

        return await DTPService.findPredecessor(
            item.project_id,
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
