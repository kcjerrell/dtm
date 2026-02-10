import type { Model, XTensorHistoryNode } from "@/commands"
import type { BackendFilter } from "./state/search"

export type ScanProgress = {
    projects_scanned: number
    projects_total: number
    project_final: number
    project_path: string
    images_scanned: number
    images_total: number
}
export type ScanProgressEvent = {
    payload: ScanProgress
}

export type DTImage = {
    image_id: number
    project_id: number
    model_id: number
    model_file: string
    prompt: string
    negative_prompt: string
    dt_id: number
    row_id: number
    wall_clock: string
}

export interface TensorHistoryExtra {
    rowId: number
    lineage: number
    logicalTime: number

    tensorId?: string | null
    maskId?: string | null
    depthMapId?: string | null
    scribbleId?: string | null
    poseId?: string | null
    colorPaletteId?: string | null
    customId?: string | null

    history: XTensorHistoryNode
    projectPath: string
}

export type ImagesSource = {
    projectIds?: number[]
    search?: string
    filters?: BackendFilter[]
    sort?: string
    direction?: "asc" | "desc"
    count?: boolean
    showVideo?: boolean
    showImage?: boolean
}

export type VersionModel = Model & {
    isVersion: true
    modelCount: number
    modelIds: number[]
}

export function isVersionModel(model: Model | VersionModel): model is VersionModel {
    return "isVersion" in model && model.isVersion
}

export type ModelVersionInfo = { label?: string; models: number; controls: number; loras: number }
