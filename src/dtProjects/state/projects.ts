import { proxy } from "valtio"
import { type ProjectExtra, pdb } from "@/commands"
import { makeSelectable, type Selectable } from "@/hooks/useSelectableV"
import va from "@/utils/array"
import type { ContainerEvent } from "@/utils/container/StateController"
import { arrayIfOnly } from "@/utils/helpers"
import { DTPStateController } from "./types"

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
}

const projectSort = (
    a: Selectable<{
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
    }>,
    b: Selectable<{
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
    }>,
): number => a.name.toLowerCase().localeCompare(b.name.toLowerCase())
class ProjectsController extends DTPStateController<ProjectsControllerState> {
    state = proxy<ProjectsControllerState>({
        projects: [],
        selectedProjects: [],
        showEmptyProjects: false,
        projectsCount: 0,
    })

    hasLoaded = false

    constructor() {
        super("projects", "projects")
    }

    protected formatTags(tags: string, data?:  { removed?: number; added?: ProjectExtra; updated?: ProjectExtra, desc?: string }): string {
        if (data?.desc)
            return `invalidate tag: ${tags} - ${data.desc}`
        if (data?.removed) 
            return `update tag - removed project - id ${data.removed}`
        if (data?.added) 
            return `update tag - added project - ${data.added.path.split("/").pop()} id ${data.added.id}`
        if (data?.updated) 
            return `update tag - updated project - ${data.updated.path.split("/").pop()} id ${data.updated.id}`
        return `update tag: ${tags} ${String(data)}`
    }

    protected handleTags(
        _tags: string,
        data: { removed?: number; added?: ProjectExtra; updated?: ProjectExtra },
    ) {
        if (data.updated) {
            const index = this.state.projects.findIndex((p) => p.id === data.updated?.id)
            if (index !== -1) {
                this.state.projects[index].filesize = data.updated.filesize
                this.state.projects[index].image_count = data.updated.image_count
                this.state.projects[index].excluded = data.updated.excluded
                this.state.projects[index].modified = data.updated.modified
            }
        } else if (data.added) {
            this.state.projects.push(
                makeSelectable({ ...data.added, name: data.added.path.split("/").pop() as string }),
            )
            this.state.projects.sort(projectSort)
            this.state.projectsCount++
        } else if (data.removed) {
            const project = this.state.projects.find((p) => p.id === data.removed)
            if (project) {
                va.remove(this.state.projects, project)
                this.state.projectsCount--
            }
        }
        this.loadProjectsDebounced()
        return true
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
        const projects = await pdb.listProjects()
        va.set(
            this.state.projects,
            projects
                .map((p) => makeSelectable({ ...p, name: p.path.split("/").pop() as string }))
                .sort(projectSort),
        )
        this.state.projectsCount = projects.length
        this.hasLoaded = true
        this.container.emit("projectsLoaded")
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

    async removeProjects(projectFiles: string[]) {
        for (const projectFile of projectFiles) {
            await pdb.removeProject(projectFile)
        }
        await this.loadProjects()
    }

    async addProjects(projectFiles: string[]) {
        for (const pf of projectFiles) {
            await pdb.addProject(pf)
        }
        await this.loadProjects()
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
            await pdb.updateExclude(project.id, exclude)
            projectState.excluded = exclude
            stateUpdate.push(projectState)
            projectState.setSelected(false)
        }
        this.setSelectedProjects([])
        const scanner = this.container.getService("scanner")
        await scanner.syncProjects(stateUpdate.map((p) => p.path))
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

    setSelectedProjects(projects: ProjectState[]) {
        va.set(this.state.selectedProjects, projects)
    }

    useSelectedProjects() {
        const snap = this.useSnap()
        return snap.selectedProjects.map((p) => p.id)
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
        console.log("show empty", this.state.showEmptyProjects)
    }
}

export default ProjectsController
