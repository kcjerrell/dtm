import { createContext, type PropsWithChildren, useContext } from "react"
import { snapshot } from "valtio"
import { watch } from "valtio/utils"
import { UIController } from "@/dtProjects/state/uiState"
import { DTPStateService } from "@/hooks/StateController"
import { useInitRef } from "@/hooks/useInitRef"
import DetailsService from "./details"
import ImagesController from "./images"
import ModelsController from "./models"
import ProjectsController from "./projects"
import ScannerService from "./scanner"
import SearchController from "./search"
import WatchFoldersController from "./watchFolders"

export type DTPContextType = {
	uiState: UIController
	projects: ProjectsController
	models: ModelsController
	watchFolders: WatchFoldersController
	scanner: ScannerService
	search: SearchController
	images: ImagesController
	details: DetailsService
}

export const DTPContext = createContext<DTPContextType | undefined>(undefined)

export function DTPProvider(props: PropsWithChildren) {
	const stateControllers = useInitRef(() => {
		const controllers = DTPStateService.containerize(() => {
			const uiState = new UIController()
			const projects = new ProjectsController()
			const watchFolders = new WatchFoldersController()
			const models = new ModelsController()

			const images = new ImagesController()
			images.onImageCountsChanged = (counts) => projects.updateImageCounts(counts)
			projects.onSelectedProjectsChanged.addHandler((projects) => images.setSelectedProjects(projects))

			const scanner = new ScannerService(projects, watchFolders, models)

			const search = new SearchController()
			search.onSearch = (text, filters) => {
				images.setSearchFilter(text, filters)
			}

			const details = new DetailsService(projects)

			return { projects, uiState, models, watchFolders, scanner, search, images, details }
		})

		connectDevMode(controllers)
		controllers.watchFolders.loadWatchFolders().then(async () => {
			await controllers.projects.loadProjects()
			await controllers.scanner.scanAndWatch()
		})
		return controllers
	})

	return <DTPContext value={stateControllers}>{props.children}</DTPContext>
}

export function useDTP() {
	const ctx = useContext(DTPContext)
	if (!ctx) {
		throw new Error("useDTP must be used within a DTPProvider")
	}
	return ctx
}

let _unwatch: () => void
async function connectDevMode(controllers: DTPContextType) {
	if (_unwatch) _unwatch()

	let _devUpdate: ReturnType<typeof setTimeout> | null = null
	if (import.meta.env.DEV) {
		const devStore = await import("@/Dev.tsx")
		_unwatch = watch((get) => {
			if (_devUpdate) clearTimeout(_devUpdate)

			for (const value of Object.values(controllers)) {
				if ("state" in value) get(value.state)
			}

			_devUpdate = setTimeout(() => {
				const update = {} as Record<string, unknown>

				for (const [key, value] of Object.entries(controllers)) {
					if ("state" in value) update[key] = snapshot(value.state)
				}
				// this is a work around since elements can't be serialized
				// if (update.detailsOverlay.subItem?.sourceElement)
				// 	// @ts-expect-error
				// 	delete update.detailsOverlay.subItem.sourceElement
				devStore.updateDevState("projects", update)
				_devUpdate = null
			}, 200)
		})
	}
}
