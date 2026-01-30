import { snapshot } from "valtio"
import { watch } from "valtio/utils"
import { UIController } from "@/dtProjects/state/uiState"
import { JobQueue } from "@/utils/container/queue"
import { Container } from "../../utils/container/container"
import DetailsService from "./details"
import ImagesController from "./images"
import ModelsController from "./models"
import ProjectsController from "./projects"
import ScannerService from "./scanner"
import SearchController from "./search"
import StorageController from "./storage"
import type { DTPContainer, DTPEvents, DTProjectsJobs, DTPServices } from "./types"
import WatchFoldersController from "./watchFolders"

let _container = createContainer()
function getContainer() {
    if (!_container || _container.isDisposed) {
        _container = createContainer()
    }
    return _container
}

window.addEventListener("unload", () => {
    if (document.hidden && _container && !_container.isDisposed) _container.dispose()
})

export function useDTP() {
    const container = getContainer()
    return container.services
}

let _unwatch: () => void
async function _connectDevMode(controllers: DTPServices) {
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
                console.log("it's happening")
                const update = {} as Record<string, unknown>
                update.jobs = controllers.jobs?.jobs
                for (const [key, value] of Object.entries(controllers)) {
                    if ("state" in value) update[key] = snapshot(value.state)
                }
                devStore.updateDevState("projects", update)
                _devUpdate = null
            }, 200)
        })
    }
}

function createContainer() {
    console.log("creating container")
    return new Container<DTPServices, DTPEvents>(() => {
        const jobs = new JobQueue<DTPContainer, DTProjectsJobs>()
        const uiState = new UIController()
        const projects = new ProjectsController()
        const watchFolders = new WatchFoldersController()
        const models = new ModelsController()
        const images = new ImagesController()
        const scanner = new ScannerService()
        const search = new SearchController()
        const details = new DetailsService(projects)
        const storage = new StorageController()

        search.onSearch = (text, filters) => {
            images.buildImageSource({ text: text ?? "", filters: filters ?? [] })
        }

        Promise.all([
            projects.loadProjects(),
            models.refreshModels(),
            watchFolders.loadWatchFolders(),
            // scanner.syncProjectFolders()
        ])

        const controllers = {
            projects,
            uiState,
            models,
            watchFolders,
            scanner,
            search,
            images,
            details,
            jobs,
            storage,
        } as DTPServices

        // connectDevMode(controllers)

        return controllers
    })
}
