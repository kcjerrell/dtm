import type { Model, ScanProgress } from "@/commands"
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
