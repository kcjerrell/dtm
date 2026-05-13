import QuickLRU from "quick-lru"
import type { ImageExtra } from "@/commands"
import DTProject from "@/commands/DTProject"
import type { TensorHistoryNode } from "@/commands/DTProjectTypes"
import type ProjectsController from "./projects"
import { DTPStateService } from "./types"

class DetailsService extends DTPStateService {
    projects: ProjectsController
    itemDetails: QuickLRU<string, TensorHistoryNode> = new QuickLRU({ maxSize: 10 })

    constructor(projects: ProjectsController) {
        super("details")
        this.projects = projects
    }

    async getDetails(item: ImageExtra): Promise<TensorHistoryNode | undefined> {
        if (!item.is_ready) return
        const key = detailsKey(item.project_id, item.node_id)
        if (this.itemDetails.has(key)) return this.itemDetails.get(key)
        const project = this.projects.state.projects.find((p) => p.id === item.project_id)
        if (!project) return

        const node = await DTProject.getTensorHistory(item.project_id, item.node_id)

        this.itemDetails.set(key, node)
        return node
    }

    async getPredecessorCandidates(_item: ImageExtra) {
        return []
    }
}

function detailsKey(projectId: number, nodeId: number) {
    return `${projectId}-${nodeId}`
}

export default DetailsService
