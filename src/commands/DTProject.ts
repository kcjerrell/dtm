import { invoke } from "@tauri-apps/api/core"
import type { TensorHistoryNodeRow, TensorDataRow } from "./DtpServiceTypes"

type TensorHistoryNodeSelect = "tensordata" | "clip" | "moodboard"

type ListTensorHistoryNodeOpts = {
    select?: TensorHistoryNodeSelect | TensorHistoryNodeSelect[]
    first?: number
    take?: number
    lineage?: number
    logicalTime?: number
    rowid?: number
    projectId?: number
    projectPath?: string
}

async function listTensorHistoryNodes(
    opts: ListTensorHistoryNodeOpts,
): Promise<TensorHistoryNodeRow[]> {
    const { projectId, projectPath, select: selectOpt, ...rest } = opts
    if (!projectId && !projectPath) throw new Error("projectId or projectPath is required")

    const select = getSelectOpt(selectOpt)

    const result = await invoke<TensorHistoryNodeRow[]>("dtp_dt_get_tensor_history_nodes", {
        ...rest,
        projectId,
        projectPath,
        select,
    })

    if (projectId) {
        return result.map((r) => ({ ...r, projectId }))
    }

    return result ?? []
}

function getSelectOpt(selectOpt?: TensorHistoryNodeSelect | TensorHistoryNodeSelect[]) {
    if (Array.isArray(selectOpt)) return selectOpt
    if (typeof selectOpt === "string") return [selectOpt]
    return undefined
}

export interface TensorDataOpts {
    lineage?: number
    logicalTime?: number
    idx?: number
    first?: number
    last?: number
}

async function tensorData(projectPath: string, opts?: TensorDataOpts): Promise<TensorDataRow[]> {
    return await invoke<TensorDataRow[]>("dt_project_tensordata", {
        projectPath,
        lineage: opts?.lineage,
        logicalTime: opts?.logicalTime,
        idx: opts?.idx,
        first: opts?.first,
        last: opts?.last,
    })
}

const DTProject = {
    listTensorHistoryNodes,
    tensorData,
}

export default DTProject
