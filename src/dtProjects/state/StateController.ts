import { type Snapshot, useSnapshot } from "valtio"
import { watch } from "valtio/utils"
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
import type { DTPEvents } from "./types"

export interface ContainerEvent<T extends string, E = undefined> {
	on: (fn: EventHandler<E>) => void
	off: (fn: EventHandler<E>) => void
}
export type EventHandler<E = undefined> = (e: E) => void

export interface DTPContainer extends Record<string, DTPStateService> {
	projects: ProjectsController
	uiState: UIController
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
	protected container: Container<DTPContainer, DTPEvents>

	constructor(registerName: string) {
		this.container = Container.register<DTPContainer, DTPEvents>(
			registerName as keyof DTPContainer,
			this as DTPContainer[keyof DTPContainer],
		)
	}

	protected _isDisposed = false
	get isDisposed() {
		return this._isDisposed
	}
	unwatchFns: (() => void)[] = []

	/** prefer this over valtio's watch() - this will track unwatch and call when disposed */
	protected watchProxy(
		watchFn: Parameters<typeof watch>[0],
		options?: Parameters<typeof watch>[1],
	) {
		const unwatch = watch(watchFn, options)
		this.unwatchFns.push(unwatch)
		return unwatch
	}

	/** must call super.dispose() when overriding! */
	dispose() {
		this.unwatchFns.forEach((unwatch) => {
			unwatch()
		})
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

	constructor(registerName: string, tagRoot?: string) {
		super(registerName)
		
		if (tagRoot) this.container.addTagHandler(tagRoot, this.handleTags.bind(this))
	}

	/** state controllers can override this to handle their registered tag type */
	protected handleTags(_tags: string, _desc?: Record<string, unknown>) {}

	useSnap(): Snapshot<T> {
		return useSnapshot(this.state)
	}
}
