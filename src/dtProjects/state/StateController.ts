import { type Snapshot, useSnapshot } from "valtio"
import type DetailsService from "@/dtProjects/state/details"
import type ImagesController from "@/dtProjects/state/images"
import type ModelsController from "@/dtProjects/state/models"
import type ProjectsController from "@/dtProjects/state/projects"
import type ScannerService from "@/dtProjects/state/scanner"
import type SearchController from "@/dtProjects/state/search"
import type { UIController } from "@/dtProjects/state/uiState"
import type WatchFoldersController from "@/dtProjects/state/watchFolders"
import { Container } from "./container"
import type JobsService from "./jobs"

export interface ContainerEvent<T extends string, E = undefined> {
	on: (fn: EventHandler<E>) => void
	off: (fn: EventHandler<E>) => void
}
export type EventHandler<E = undefined> = (e: E) => void

export interface DTPContainer extends Record<string, DTPStateService> {
	projects: ProjectsController
	ui: UIController
	models: ModelsController
	watchFolders: WatchFoldersController
	scanner: ScannerService
	search: SearchController
	images: ImagesController
	details: DetailsService
	jobs: JobsService
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
	protected container: Container<DTPContainer>

	constructor(registerName: string) {
		this.container = Container.register(
			registerName as keyof DTPContainer,
			this as DTPContainer[keyof DTPContainer],
		)
	}

	protected getService<T extends keyof DTPContainer>(name: T): DTPContainer[T] {
		return this.container?.getService(name)
	}

	protected getFutureService<T extends keyof DTPContainer>(name: T): Promise<DTPContainer[T]> {
		return this.container?.getFutureService(name)
	}

	/** identify one or more tags as being in need of refreshing. this will not be overriden by subclasses */
	protected invalidate(tags: string, desc?: string) {
		this.container?.invalidate(tags, desc)
	}

	protected _isDisposed = false
	get isDisposed() {
		return this._isDisposed
	}

	/** must call super.dispose() when overriding! */
	dispose() {
		this._isDisposed = true
	}
}

export abstract class DTPStateController<T extends object = object>
	extends DTPStateService
	implements StateController<T>
{
	abstract state: T

	/** the tags this controller is interested in. e.g. "project" or "project:34" */
	protected tags?: string[]

	constructor(registerName: string, tags?: string[]) {
		super(registerName)
		if (tags) this.tags = tags
	}

	/** state controllers can override this to handle their registered tag type */
	protected handleTags(_tags: string, _desc: string) {}

	/** @internal should only be called by DTPStateService.invalidate */
	_internalHandleTags(tags: string, desc: string) {
		if (!this.tags) return

		const match = this.tags.some((t) => {
			if (t === tags) return true
			if (tags.startsWith(`${t}:`)) return true
			if (t.startsWith(`${tags}:`)) return true
			return false
		})

		if (match) {
			this.handleTags(tags, desc)
		}
	}

	useSnap(): Snapshot<T> {
		return useSnapshot(this.state)
	}
}
