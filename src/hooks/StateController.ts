import { type Snapshot, useSnapshot } from "valtio"
import type DetailsService from "@/dtProjects/state/details"
import type ImagesController from "@/dtProjects/state/images"
import type ModelsController from "@/dtProjects/state/models"
import type ProjectsController from "@/dtProjects/state/projects"
import type ScannerService from "@/dtProjects/state/scanner"
import type SearchController from "@/dtProjects/state/search"
import type { UIController } from "@/dtProjects/state/uiState"
import type WatchFoldersController from "@/dtProjects/state/watchFolders"

type Container = Record<string, unknown>

interface DTPContainer extends Container {
	projects: ProjectsController
	uiState: UIController
	models: ModelsController
	watchFolders: WatchFoldersController
	scanner: ScannerService
	search: SearchController
	images: ImagesController
	details: DetailsService
}

/**
 * Abstract base class for controllers using valtio state proxies
 */
interface StateController<T extends object = object> {
	/**
	 * The state proxy - this must be a valtio proxy object
	 */
	state: T

	/**
	 * Returns a snapshot of the state.
	 * This is a hook and must be called within a React component.
	 */
	useSnap(): Snapshot<T>
}

export abstract class DTPStateService {
	private container?: DTPContainer

	constructor() {
		if (DTPStateService._container) {
			this.container = DTPStateService._container as DTPContainer
			const name = this.constructor.name
				.replace("Service", "")
				.replace("Controller", "")
				.toLowerCase()
			this.container[name] = this
		}
	}

	protected getService<T extends keyof DTPContainer>(name: T): DTPContainer[T] {
		return this.container?.[name] as DTPContainer[T]
	}

	private static _container?: Partial<DTPContainer>
	static containerize<T>(init: () => T) {
		DTPStateService._container = {}
		try {
			return init()
		} finally {
			DTPStateService._container = undefined
		}
	}
}

export abstract class DTPStateController<T extends object = object>
	extends DTPStateService
	implements StateController<T>
{
	abstract state: T

	useSnap(): Snapshot<T> {
		return useSnapshot(this.state)
	}
}
