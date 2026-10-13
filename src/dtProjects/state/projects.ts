import { proxy } from "valtio"
import type { ProjectExtra } from "@/commands"
import DTPService from "@/commands/DtpService"
import { makeSelectable, type Selectable } from "@/hooks/useSelectableV"
import { getSetting, subscribeSetting } from "@/state/settings"
import type { ContainerEvent } from "@/utils/container/StateController"
import { areEquivalent, arrayIfOnly, groupMap } from "@/utils/helpers"
import va from "@/utils/valtio"
import { DTPStateController } from "./types"
import type { WatchFolderState } from "./watchFolders"

export interface ProjectState extends Selectable<ProjectExtra> {
    name: string
    isScanning?: boolean
    isMissing?: boolean
}

export type ProjectsControllerState = {
    projects: ProjectState[]
    selectedProjects: ProjectState[]
    hideEmptyProjects: boolean
    projectsCount: number
    folders: {
        watchfolder: WatchFolderState
        projects: ProjectState[]
    }[]
}

type ProjectSortItem = Pick<ProjectExtra, "name" | "path">

export function getProjectPathParts(project: ProjectSortItem) {
    const pathParts = project.path.split(/[\\/]/)
    const filename = pathParts.at(-1) ?? project.name
    return {
        subpath: pathParts.slice(0, -1),
        projectName: filename.replace(/\.sqlite3$/i, ""),
    }
}

const projectSort = (a: ProjectSortItem, b: ProjectSortItem): number => {
    return a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase())
}

const projectSortSubpath = (a: ProjectSortItem, b: ProjectSortItem): number => {
    const aa = a.path.split("/")
    const bb = b.path.split("/")

    for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
        if (aa[i] === bb[i]) continue

        const aIsDir = i < aa.length - 1
        const bIsDir = i < bb.length - 1

        // Directories before files
        if (aIsDir !== bIsDir) {
            return aIsDir ? -1 : 1
        }

        // Same kind: alphabetical
        return aa[i].localeCompare(bb[i])
    }

    return aa.length - bb.length
}

class ProjectsController extends DTPStateController<ProjectsControllerState> {
    state = proxy<ProjectsControllerState>({
        projects: [],
        selectedProjects: [],
        hideEmptyProjects: false,
        projectsCount: 0,
        folders: [],
    })

    hasLoaded = false

    constructor() {
        super("projects")

        this.container.on("project_added", (project) => {
            // this.state.projects.push(this.createProjectState(project))
            // this.sortProjects()
            // this.state.projectsCount++
            this.loadProjectsDebounced()
        })

        this.container.on("projects_changed", () => {
            this.loadProjects()
        })

        this.container.on("project_removed", (projectId) => {
            const projectState = this.state.projects.find((p) => p.id === projectId)
            if (!projectState) return

            va.remove(this.state.projects, projectState)
            this.state.projectsCount--

            if (projectState?.selected) {
                va.remove(this.state.selectedProjects, projectState)
            }

            const folder = this.state.folders.find(
                (f) => f.watchfolder.id === projectState?.watchfolder_id,
            )
            if (folder) {
                va.remove(folder.projects, projectState)
            }

            this.loadProjectsDebounced()
        })

        this.container.on("project_updated", (project) => {
            const projectState = this.state.projects.find((p) => p.id === project.id)
            if (projectState) {
                Object.assign(projectState, project)
            }
            this.loadProjectsDebounced()
        })

        this.container.on("project_sync_started", (projectId) => {
            const projectState = this.state.projects.find((p) => p.id === projectId)
            if (projectState) {
                projectState.isScanning = true
            }
        })

        this.container.on("project_sync_complete", (projectId) => {
            const projectState = this.state.projects.find((p) => p.id === projectId)
            if (projectState) {
                projectState.isScanning = false
            }
        })

        this.unwatchFns.push(
            subscribeSetting("projects.showSubpathInProjectList", () => {
                this.loadProjects()
            }),
        )
    }

    updateProject(projectId: number, data: Partial<ProjectExtra>) {
        const project = this.state.projects.find((p) => p.id === projectId)
        if (project) {
            Object.assign(project, data)
        }
    }

    private _onProjectsLoaded: ContainerEvent<"projectsLoaded"> = {
        on: (fn: (_: undefined) => void) => this.container.on("projectsLoaded", fn),
        once: (fn: (_: undefined) => void) => this.container.once("projectsLoaded", fn),
        off: (fn: (_: undefined) => void) => this.container.off("projectsLoaded", fn),
    }
    get onProjectsLoaded() {
        return this._onProjectsLoaded
    }

    async loadProjects() {
        const wfs = this.container.getService("watchFolders")
        const watchfolders = await wfs.loadWatchFolders()
        const dtpProjects = await DTPService.listProjects()
        const sortFn = getSetting("projects.showSubpathInProjectList")
            ? projectSortSubpath
            : projectSort
        const selected = this.state.selectedProjects.map((p) => ({ id: p.id }))

        const folders = groupMap(
            dtpProjects,
            (p) => [p.watchfolder_id, this.createProjectState(p)],
            (folderId, folderProjects) => {
                const folder = watchfolders.find((f) => f.id === folderId)
                return {
                    watchfolder: folder,
                    projects: folderProjects.sort(sortFn),
                }
            },
        ).filter(
            (f) => f.watchfolder !== undefined && f.projects.length > 0,
        ) as ProjectsControllerState["folders"]

        const newProjects = folders.flatMap((f) => f.projects)

        va.set(this.state.folders, folders)
        va.set(this.state.projects, newProjects)
        this.setSelectedProjects(selected)
        this.state.projectsCount = this.state.projects.length
        this.hasLoaded = true
        this.container.emit("projectsLoaded")
    }

    private getVisibleProjects() {
        const { imageSource, projectImageCounts } = this.container.getService("images").state
        const showAltCount = !!imageSource.filters?.length || !!imageSource.search
        return this.state.projects.filter(
            (p) =>
                !showAltCount ||
                !this.state.hideEmptyProjects ||
                p.selected ||
                !!projectImageCounts?.[p.id],
        )
    }

    private lastSelectedProject: ProjectState | null = null
    selectItem(
        project: ProjectState,
        currentValue: boolean,
        modifier?: "shift" | "cmd" | "context" | null,
    ) {
        const item = this.state.projects.find((p) => p.id === project.id)
        if (!item) return
        // if opening context menu, item will be selected
        if (modifier === "context") {
            // if already selected, do nothing
            if (currentValue) return
        }

        // toggle item
        if (modifier === "cmd") {
            item.setSelected(!currentValue)
            this.lastSelectedProject = item
        }
        // this is the tricky one
        else if (modifier === "shift") {
            const visibleProjects = this.getVisibleProjects()
            const lastIndex = visibleProjects.findIndex(
                (p) => p.id === this.lastSelectedProject?.id,
            )
            const currentIndex = visibleProjects.findIndex((p) => p.id === item.id)
            if (currentIndex === -1) return

            // if there is no lastselected index, just select/deselect the item
            if (lastIndex === -1) {
                item.toggleSelected()
            } else {
                const from = Math.min(lastIndex, currentIndex)
                const to = Math.max(lastIndex, currentIndex)
                const rangeIds = new Set(visibleProjects.slice(from, to + 1).map((p) => p.id))
                this.state.projects.forEach((p) => {
                    p.setSelected(rangeIds.has(p.id) && !p.excluded)
                })
            }
        }
        // change selected or deselect if only selected
        else {
            const areOthersSelected = this.state.projects.some(
                (p) => p.id !== item.id && p.selected,
            )
            if (areOthersSelected) {
                // if others are selected, the current state of this item is irrelevant.
                // the selection becomes this item
                this.state.projects.forEach((p) => {
                    p.setSelected(false)
                })
                item.setSelected(true)
            } else {
                // if no others are selected, we can just toggle this item
                item.toggleSelected()
            }
            this.lastSelectedProject = item
        }
        const selectedProjects = this.state.projects.filter((p) => p.selected)
        va.set(this.state.selectedProjects, selectedProjects)
    }

    private loadProjectsTimeout: number | null = null
    async loadProjectsDebounced() {
        if (this.loadProjectsTimeout) {
            clearTimeout(this.loadProjectsTimeout)
        }
        this.loadProjectsTimeout = window.setTimeout(async () => {
            await this.loadProjects()
            await this.container.getService("models").refreshModels()
        }, 1000)
    }

    /**
     * this function can be called with a project or an array of projects
     * state or snapshot
     */
    async setExclude(projects: ProjectState | readonly ProjectState[], exclude: boolean) {
        const toUpdate = arrayIfOnly(projects)
        const stateUpdate: ProjectState[] = []
        for (const project of toUpdate) {
            const projectState = this.state.projects.find((p) => p.id === project.id)
            if (!projectState) continue
            await DTPService.updateProjectExclude(project.id, exclude)
            projectState.excluded = exclude
            stateUpdate.push(projectState)
            projectState.setSelected(false)
        }
        this.setSelectedProjects([])
    }

    getProject(projectId?: number | null) {
        if (Number.isNaN(projectId)) return undefined
        return this.state.projects.find((p) => p.id === projectId)
    }

    /**
     * Updates the image count for each project
     * @param counts Record of project id to image count
     */
    updateImageCounts(counts: Record<number, number>) {
        for (const project of this.state.projects) {
            project.image_count = counts[project.id] ?? 0
        }
    }

    setSelectedProjects(projects: Pick<ProjectState, "id">[]) {
        const projectIds = new Set(projects.map((p) => p.id))
        for (const project of this.state.projects) {
            project.setSelected(projectIds.has(project.id))
        }
        va.set(
            this.state.selectedProjects,
            this.state.projects.filter((p) => p.selected),
        )
    }

    /// set selection to every project in the watchfolder
    /// UNLESS every project in the folder and ONLY projects in the folder are selected
    /// in which case we deselect all projects
    /// this depends on sort being the same
    selectFolderProjects(watchfolder: WatchFolderState) {
        const selectedIds = this.state.selectedProjects.map((p) => p.id)
        const folderGroup = this.state.folders.find(
            (f) => f.watchfolder.id === watchfolder.id,
        )?.projects
        if (!folderGroup) return
        const visibleIds = new Set(
            this.getVisibleProjects()
                .filter((p) => p.watchfolder_id === watchfolder.id && !p.excluded)
                .map((p) => p.id),
        )
        const select = !areEquivalent(selectedIds, [...visibleIds])

        const selected: ProjectState[] = []

        if (select) {
            for (const project of this.state.projects) {
                project.setSelected(visibleIds.has(project.id))
                if (project.selected) selected.push(project)
            }
        } else {
            this.state.projects.forEach((p) => {
                p.setSelected(false)
            })
        }

        va.set(this.state.selectedProjects, selected)
    }

    useProjectsSummary() {
        const snap = this.useSnap()
        return {
            totalProjects: snap.projects.length,
            totalImages: snap.projects.reduce((acc, p) => acc + (p.image_count ?? 0), 0),
            totalSize: snap.projects.reduce((acc, p) => acc + (p.filesize ?? 0), 0),
        }
    }

    toggleHideEmptyProjects() {
        this.state.hideEmptyProjects = !this.state.hideEmptyProjects
    }

    private createProjectState(project: ProjectExtra) {
        return makeSelectable(
            {
                ...project,
                name: project.path.split("/").pop() as string,
            },
            false,
            (item, currentValue, modifier) => this.selectItem(item, currentValue, modifier),
        )
    }
}

export default ProjectsController
