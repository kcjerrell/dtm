import { invoke } from "@tauri-apps/api/core"
import { TensorHistoryNode, type TensorHistoryNodeResponse } from "./DTProjectTypes"

type TensorHistoryNodeSelect = "tensordata" | "clip" | "moodboard" | "legacy_prompts"

type ListTensorHistoryNodeOpts = {
    select?: TensorHistoryNodeSelect | TensorHistoryNodeSelect[]
    skip?: number
    take?: number
    minRowid?: number
    maxRowid?: number
    lineage?: number
    logicalTime?: number
    rowid?: number
    projectId?: number
    projectPath?: string
}

async function listTensorHistoryNodes(
    opts: ListTensorHistoryNodeOpts,
): Promise<TensorHistoryNode[]> {
    const { projectId, projectPath, select: selectOpt, ...rest } = opts
    if (!projectId && !projectPath) throw new Error("projectId or projectPath is required")

    const select = getSelectOpt(selectOpt)

    const result = await invoke<TensorHistoryNodeResponse[]>("dtp_dt_get_tensor_history_nodes", {
        ...rest,
        projectId,
        projectPath,
        select,
    })

    return result.map((r) => new TensorHistoryNode(r, projectId))
}

function getSelectOpt(selectOpt?: TensorHistoryNodeSelect | TensorHistoryNodeSelect[]) {
    if (Array.isArray(selectOpt)) return selectOpt
    if (typeof selectOpt === "string") return [selectOpt]
    return undefined
}

async function getTensorHistory(projectId: number, rowId: number) {
    const rows = await listTensorHistoryNodes({
        projectId,
        rowid: rowId,
        select: ["tensordata", "clip", "moodboard", "legacy_prompts"],
    })
    return rows[0]
}

const DTProject = {
    listTensorHistoryNodes,
    getTensorHistory,
}

export default DTProject
