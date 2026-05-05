import type { Model, ScanProgress, TensorDataRow } from "@/commands"
import type { OpenPose } from "@/utils/poseHelpers"
import type { BackendFilter } from "./state/search"

export type ScanProgressEvent = {
    payload: ScanProgress
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
    showDisconnected?: boolean
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

export type SubItem = {
    projectId: number
    tensorId: string
    type: TensorType
    maskUrl?: string
    applyMask?: boolean
    thumbUrl: string
    url?: string
    width?: number
    height?: number
    isLoading: boolean
    pose?: MaybeReadonly<OpenPose>
}

export type CanvasStack = {
    projectId: number
    nodeId: number
    tensorData: readonly MaybeReadonly<TensorDataRow>[]
    isLoading: boolean
    width?: number
    height?: number
}

export function isCanvasStack(item: unknown): item is MaybeReadonly<CanvasStack>
export function isCanvasStack(item: unknown): item is CanvasStack {
    return (
        typeof item === "object" &&
        item !== null &&
        "projectId" in item &&
        typeof item.projectId === "number" &&
        "tensorData" in item &&
        Array.isArray(item.tensorData)
    )
}

export type TensorType =
    | "binary_mask"
    | "color_palette"
    | "custom"
    | "depth_map"
    | "pose"
    | "scribble"
    | "shuffle"
    | "tensor_history"
    | "audio"
