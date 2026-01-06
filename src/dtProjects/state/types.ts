import type { IContainer } from '@/utils/container/interfaces'
import { StateController, StateService } from "@/utils/container/StateController"
import type DetailsService from './details'
import type ImagesController from './images'
import type JobsService from './jobs'
import type ModelsController from './models'
import type ProjectsController from './projects'
import type ScannerService from './scanner'
import type SearchController from './search'
import type { UIController } from './uiState'
import type { WatchFolderState, WatchFoldersController } from "./watchFolders"

export type DTPEvents = {
    watchFoldersChanged: (e: WatchFoldersChangedPayload) => void
    projectFilesChanged: (e: ProjectFilesChangedPayload) => void
}

interface WatchFoldersChangedPayload {
    added: WatchFolderState[]
    removed: WatchFolderState[]
    changed: WatchFolderState[]
}

interface ProjectFilesChangedPayload {
    files: string[]
}

export type DTPContainer = IContainer<DTPServices, DTPEvents>

export const DTPStateService = StateService<DTPContainer>

export abstract class DTPStateController<T extends object> extends StateController<DTPContainer, T> {}

export interface DTPServices {
	uiState: UIController
	projects: ProjectsController
	models: ModelsController
	watchFolders: WatchFoldersController
	scanner: ScannerService
	search: SearchController
	images: ImagesController
	details: DetailsService
	jobs: JobsService
}