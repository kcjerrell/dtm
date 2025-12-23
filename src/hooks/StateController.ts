import { type Snapshot, useSnapshot } from "valtio"
import { listen } from "@tauri-apps/api/event"
import type DetailsService from "@/dtProjects/state/details"
import type ImagesController from "@/dtProjects/state/images"
import type ModelsController from "@/dtProjects/state/models"
import type ProjectsController from "@/dtProjects/state/projects"
import type ScannerService from "@/dtProjects/state/scanner"
import type SearchController from "@/dtProjects/state/search"
import type { UIController } from "@/dtProjects/state/uiState"
import type WatchFoldersController from "@/dtProjects/state/watchFolders"

export type Container<T> = {
	services: T
	invalidate: (tags: string) => void
	dispose: () => void
}

interface DTPContainer {
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
		private container?: Container<DTPContainer>

		constructor() {
			if (DTPStateService._container) {
				this.container = DTPStateService._container as Container<DTPContainer>
				const name =
					(this.constructor as typeof DTPStateService & { registryName?: string }).registryName ||
					this.constructor.name.replace("Service", "").replace("Controller", "").toLowerCase()
				;(this.container.services as unknown as Record<string, unknown>)[name] = this
			}
		}

		protected getService<T extends keyof DTPContainer>(name: T): DTPContainer[T] {
			return this.container?.services[name] as DTPContainer[T]
		}

		/** identify one or more tags as being in need of refreshing. this will not be overriden by subclasses */
		protected invalidate(tags: string) {
			this.container?.invalidate(tags)
		}

		private static _container?: Container<Partial<DTPContainer>>
		static containerize<T>(init: () => T): Container<T> {
			const services = {} as Partial<DTPContainer>
			const invalidate = (tags: string) => {
				for (const service of Object.values(services)) {
					if (service instanceof DTPStateController) {
						service._internalHandleTags(tags)
					}
				}
			}

			const unlistenPromise = listen("invalidate-tags", (event) => {
				invalidate(event.payload as string)
			})

			const dispose = () => {
				unlistenPromise.then((u) => u())
			}

			const container = { services, invalidate, dispose } as Container<Partial<DTPContainer>>
			DTPStateService._container = container
			try {
				const result = init()
				const finalContainer = { services: result, invalidate, dispose } as Container<T>
				return finalContainer
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

		/** the tags this controller is interested in. e.g. "project" or "project:34" */
		protected tags?: string[]

		constructor(tags?: string[]) {
			super()
			if (tags) this.tags = tags
		}

		/** state controllers can override this to handle their registered tag type */
		protected handleTags(_tags: string) {}

		/** @internal should only be called by DTPStateService.invalidate */
		_internalHandleTags(tags: string) {
			if (!this.tags) return

			const match = this.tags.some((t) => {
				if (t === tags) return true
				if (tags.startsWith(`${t}:`)) return true
				if (t.startsWith(`${tags}:`)) return true
				return false
			})

			if (match) {
				this.handleTags(tags)
			}
		}

		useSnap(): Snapshot<T> {
			return useSnapshot(this.state)
		}
	}
