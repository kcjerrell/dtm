import { invoke } from "@tauri-apps/api/core"
import type { TensorHistoryNodeRow, TensorDataRow } from "./DtpServiceTypes"

async function listTensorHistoryNodes(
    projectId: number,
    skip?: number,
    take?: number,
): Promise<TensorHistoryNodeRow[]> {
    const result = await invoke<TensorHistoryNodeRow[]>("dtp_dt_list_tensor_history_node", {
        projectId,
        skip,
        take,
    })
    return (result ?? []).map((row) => ({
        ...row,
        projectId,
    }))
}

export interface TensorDataOpts {
    lineage?: number
    logicalTime?: number
    idx?: number
    first?: number
    last?: number
}

async function tensorData(
    projectPath: string,
    opts?: TensorDataOpts
): Promise<TensorDataRow[]> {
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
