import { proxy, subscribe, useSnapshot } from "valtio"
import { pdb } from "@/commands"
import {
    EmptyItemSource,
    type IItemSource,
    PagedItemSource,
} from "@/components/virtualizedList/PagedItemSource"
import type { ImageExtra } from "@/generated/types"
import type { ContainerEvent } from "@/utils/container/StateController"
import type { ImagesSource } from "../types"
import type { ProjectState, ProjectsControllerState } from "./projects"
import type { BackendFilter } from "./search"
import { DTPStateController } from "./types"

export type ImagesControllerState = {
    imageSource: ImagesSource
    totalImageCount?: number
    selectedProjectsCount?: number
    projectImageCounts?: Record<number, number>
    imageSize?: number
    searchId: number
}

class ImagesController extends DTPStateController<ImagesControllerState> {
    state = proxy<ImagesControllerState>({
        imageSource: { projectIds: [], direction: "desc", sort: "wall_clock" },
        totalImageCount: undefined,
        selectedProjectsCount: undefined,
        projectImageCounts: undefined,
        imageSize: undefined,
        searchId: 0,
    })

    itemSource: IItemSource<ImageExtra> = new EmptyItemSource()
    eventTimer: NodeJS.Timeout | undefined

    private _onImagesChanged: ContainerEvent<"imagesChanged"> = {
        on: (fn: (_: undefined) => void) => this.container.on("imagesChanged", fn),
        off: (fn: (_: undefined) => void) => this.container.off("imagesChanged", fn),
        once: (fn: (_: undefined) => void) => this.container.once("imagesChanged", fn),
    }
    get onImagesChanged() {
        return this._onImagesChanged
    }

    constructor() {
        super("images")

        this.container.getFutureService("projects").then((projectsService) => {
            const unsubProjects = subscribe(projectsService.state.selectedProjects, () => {
                this.buildImageSource()
            })
            this.unwatchFns.push(unsubProjects)

            this.watchProxy(async (get) => {
                const p = get(projectsService.state.projects)
                const changed = updateProjectsCache(p, this.projectsCache)

                if (changed.length > 0) {
                    await this.container.services.uiState.importLockPromise
                    if (this.eventTimer) return
                    clearTimeout(this.eventTimer)
                    this.eventTimer = setTimeout(async () => {
                        await this.refreshImageCounts()
                        this.container.emit("imagesChanged")
                        this.eventTimer = undefined
                    }, 1000)
                }
            })
        })

        this.watchProxy((get) => {
            const source = get(this.state.imageSource)
            console.log("imageSource", source)
            const getItems = async (skip: number, take: number) => {
                const s = { ...source }
                if (s.showImage === false && s.showVideo === false) {
                    s.showImage = true
                    s.showVideo = true
                }
                const res = await pdb.listImages(s, skip, take)
                return res.images
            }
            const getCount = async () => {
                await this.refreshImageCounts()
                return this.state.selectedProjectsCount ?? 0
            }
            const itemSource = new PagedItemSource({
                getItems,
                getCount,
                pageSize: 250,
                onActiveItemChanged: (item) => {
                    if (item) this.container.getService("uiState")?.showDetailsOverlay(item)
                },
            })
            itemSource.renderWindow = [0, 20]
            this.itemSource = itemSource
            this.state.searchId++

            this.refreshImageCounts()
        })
    }

    buildImageSource(search?: { text?: string; filters?: BackendFilter[] }) {
        if (search) {
            this.setSearchText(search.text)
            this.setSearchFilters(search.filters)
        }

        const selectedProjects = this.container.getService("projects")?.state.selectedProjects
        if (selectedProjects) this.setSelectedProjects(selectedProjects)
    }

    projectsCache: Record<number, number> = {}

    toggleSortDirection() {
        if (!this.state.imageSource) return
        if (this.state.imageSource?.direction === "asc") this.state.imageSource.direction = "desc"
        else this.state.imageSource.direction = "asc"
    }

    async setSearchFilters(filters?: BackendFilter[]) {
        this.state.imageSource.filters = filters?.map((f) => ({
            target: f.target.toLowerCase(),
            operator: f.operator,
            value: f.value,
        }))
    }

    async setSearchText(searchText?: string) {
        this.state.imageSource.search = searchText
            ?.replace(/\u201C|\u201D/g, '"')
            .replace(/\u2018|\u2019/g, "'")
    }

    async setSelectedProjects(projects: ProjectState[]) {
        this.state.imageSource.projectIds = projects.map((p) => p.id)
    }

    selectNextItem() {
        if (this.itemSource.activeItemIndex === undefined) return
        this.itemSource.activeItemIndex++
    }

    selectPrevItem() {
        if (this.itemSource.activeItemIndex === undefined) return
        this.itemSource.activeItemIndex--
    }

    async refreshImageCounts() {
        const source = { ...this.state.imageSource }
        console.log("refreshImageCounts", source)
        if (source.showImage === false && source.showVideo === false) {
            source.showImage = true
            source.showVideo = true
        }
        const { total, counts } = await pdb.listImagesCount(source)
        const projectCounts = {} as Record<string, number>
        for (const count of counts) {
            projectCounts[count.project_id] = count.count
        }

        this.state.projectImageCounts = projectCounts
        this.state.selectedProjectsCount = this.state.imageSource.projectIds?.length
            ? this.state.imageSource.projectIds?.reduce(
                  (acc, p) => acc + (projectCounts[p] ?? 0),
                  0,
              )
            : total
        this.state.totalImageCount = total
    }

    setShowVideos(show: boolean) {
        this.state.imageSource.showVideo = show
    }

    setShowImages(show: boolean) {
        this.state.imageSource.showImage = show
    }

    useItemSource() {
        const _id = useSnapshot(this.state).searchId
        return this.itemSource
    }

    override dispose() {
        super.dispose()
    }
}

export default ImagesController

/** updates a projects cache in place and returns a list of project ids where the count has changed */
function updateProjectsCache(
    projects: ProjectsControllerState["projects"],
    cache: Record<number, number>,
) {
    const projectsChanged: number[] = []

    const visited: Record<number, number | null> = { ...cache }
    for (const project of projects) {
        visited[project.id] = null
        if (cache[project.id] !== project.image_count) {
            projectsChanged.push(project.id)
            cache[project.id] = project.image_count ?? 0
        }
    }

    for (const key in visited) {
        if (visited[key] !== null) {
            delete cache[key]
            projectsChanged.push(Number(key))
        }
    }

    return projectsChanged
}
