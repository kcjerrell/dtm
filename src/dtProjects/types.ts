import type { Model, ScanProgress } from "@/commands"
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
    pose?: OpenPose
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
