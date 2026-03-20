import { proxy } from "valtio"
import type { ProjectExtra } from "@/commands"
import DTPService from "@/commands/DtpService"
import { makeSelectable, type Selectable } from "@/hooks/useSelectableV"
import va from "@/utils/array"
import type { ContainerEvent } from "@/utils/container/StateController"
import { areEquivalent, arrayIfOnly, groupMap } from "@/utils/helpers"
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
    showEmptyProjects: boolean
    projectsCount: number
    folders: {
        watchfolder: WatchFolderState
        projects: ProjectState[]
    }[]
}

const projectSort = (
    a: {
        name: string
        id: number
        fingerprint: string
        path: string
        image_count: number | null
        last_id: number | null
        filesize: number | null
        modified: number | null
        missing_on: number | null
        excluded: boolean
    },
    b: {
        name: string
        id: number
        fingerprint: string
        path: string
        image_count: number | null
        last_id: number | null
        filesize: number | null
        modified: number | null
        missing_on: number | null
        excluded: boolean
    },
): number => a.name.toLowerCase().localeCompare(b.name.toLowerCase())

class ProjectsController extends DTPStateController<ProjectsControllerState> {
    state = proxy<ProjectsControllerState>({
        projects: [],
        selectedProjects: [],
        showEmptyProjects: false,
        projectsCount: 0,
        folders: [],
    })

    hasLoaded = false

    constructor() {
        super("projects")

        this.container.on("project_added", (project) => {
            this.state.projects.push(
                makeSelectable({ ...project, name: project.path.split("/").pop() as string }),
            )
            this.state.projects.sort(projectSort)
            this.state.projectsCount++
            this.loadProjectsDebounced()
        })

        this.container.on("projects_changed", () => {
            this.loadProjects()
        })

        this.container.on("project_removed", (projectId) => {
            const projectState = this.state.projects.find((p) => p.id === projectId)
            if (projectState) {
                va.remove(this.state.projects, projectState)
                this.state.projectsCount--
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
        const dtpProjects = await (await DTPService.listProjects()).sort(projectSort)
        const selected = this.state.selectedProjects.map((p) => ({ id: p.id }))

        const folders = groupMap(
            dtpProjects,
            (p) => [
                p.watchfolder_id,
                makeSelectable(
                    {
                        ...p,
                        name: p.path.split("/").pop() as string,
                    },
                    false,
                    (item, currentValue, modifier) => this.selectItem(item, currentValue, modifier),
                ),
            ],
            (folderId, folderProjects) => {
                const folder = watchfolders.find((f) => f.id === folderId)
                return {
                    watchfolder: folder,
                    projects: folderProjects,
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

    private lastSelectedProject: ProjectState | null = null
    selectItem(
        item: ProjectState,
        currentValue: boolean,
        modifier?: "shift" | "cmd" | "context" | null,
    ) {
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
            const lastIndex = this.state.projects.findIndex(
                (p) => p.id === this.lastSelectedProject?.id,
            )
            const currentIndex = this.state.projects.findIndex((p) => p.id === item.id)
            if (currentIndex === -1) return

            // if there is no lastselected index, just select/deselect the item
            if (lastIndex === -1) {
                item.toggleSelected()
            } else {
                const from = Math.min(lastIndex, currentIndex)
                const to = Math.max(lastIndex, currentIndex)
                this.state.projects.forEach((p, i) => {
                    if (i >= from && i <= to && !p.excluded) p.setSelected(true)
                    else p.setSelected(false)
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

    private loadProjectsTimeout: NodeJS.Timeout | null = null
    async loadProjectsDebounced() {
        if (this.loadProjectsTimeout) {
            clearTimeout(this.loadProjectsTimeout)
        }
        this.loadProjectsTimeout = setTimeout(() => {
            this.loadProjects()
        }, 2000)
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
            await DTPService.updateProject(project.id, exclude)
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
        va.set(this.state.selectedProjects, projects)
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
        const select = !areEquivalent(
            selectedIds,
            folderGroup.filter((p) => !p.excluded).map((p) => p.id),
        )

        const selected: ProjectState[] = []

        if (select) {
            for (const project of this.state.projects) {
                project.setSelected(project.watchfolder_id === watchfolder.id && !project.excluded)
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

    toggleShowEmptyProjects() {
        this.state.showEmptyProjects = !this.state.showEmptyProjects
    }
}

export default ProjectsController
