import type { IContainer } from "@/utils/container/interfaces"
import type { JobQueue, JobResult, JobSpec, JobUnion } from "@/utils/container/queue"
import { Service } from "@/utils/container/Service"
import { StateController } from "@/utils/container/StateController"
import type DetailsService from "./details"
import type ImagesController from "./images"
import type ModelsController from "./models"
import type ProjectsController from "./projects"
import type ScannerService from "./scanner"
import type { ProjectJobPayload } from "./scanner"
import type SearchController from "./search"
import type { UIController } from "./uiState"
import type { WatchFolderState, WatchFoldersController } from "./watchFolders"

export type DTProjectsJobs = {
    "models-refresh": {
        data: undefined
        result: never
    }
    "models-scan": {
        data: string
        result: never
    }
    "project-add": {
        data: string[]
        result: never
    }
    "project-update": {
        data: ProjectJobPayload
        result: never
    }
    "project-remove": {
        data: ProjectJobPayload
        result: never
    }
    "project-folder-scan": {
        data: string
        result: never
    }
    "projects-sync": {
        data: undefined
        result: never
    }
    "project-import": {
        data: string
        result: never
    }
}

export type DTPJob = JobUnion<DTPContainer, DTProjectsJobs>
export type DTPJobSpec<J extends keyof DTProjectsJobs> = JobSpec<DTPContainer, DTProjectsJobs, J>
export type DTPJobResult<J extends keyof DTProjectsJobs> = JobResult<
    DTProjectsJobs,
    J,
    DTPContainer
>

export type DTProjectsContainer = IContainer<DTPServices, DTPEvents>

export type DTPEvents = {
    watchFoldersChanged: (payload: WatchFoldersChangedPayload) => void
    projectFilesChanged: (payload: ProjectFilesChangedPayload) => void
}

export interface WatchFoldersChangedPayload {
    added: WatchFolderState[]
    removed: WatchFolderState[]
    changed: WatchFolderState[]
}

export interface ProjectFilesChangedPayload {
    files: string[]
}

export type DTPContainer = IContainer<DTPServices, DTPEvents>

export const DTPStateService = Service<DTPContainer>

export abstract class DTPStateController<T extends object> extends StateController<
    DTPContainer,
    T
> {}

export interface DTPServices {
    uiState: UIController
    projects: ProjectsController
    models: ModelsController
    watchFolders: WatchFoldersController
    scanner: ScannerService
    search: SearchController
    images: ImagesController
    details: DetailsService
    jobs: JobQueue<DTPContainer, DTProjectsJobs>
}
