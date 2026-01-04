import { proxy } from "valtio"
import { type ProjectExtra, pdb } from "@/commands"
import { DTPStateController } from "@/dtProjects/state/StateController"
import { makeSelectable, type Selectable } from "@/hooks/useSelectableV"
import va from "@/utils/array"
import { eventCallback } from "@/utils/handler"
import { arrayIfOnly } from "@/utils/helpers"

export interface ProjectState extends Selectable<ProjectExtra> {
    name: string
    isScanning?: boolean
    isMissing?: boolean
}

export type ProjectsControllerState = {
    projects: ProjectState[]
    selectedProjects: ProjectState[]
    showEmptyProjects: boolean
}

class ProjectsController extends DTPStateController<ProjectsControllerState> {
    state = proxy<ProjectsControllerState>({
        projects: [],
        selectedProjects: [],
        showEmptyProjects: false,
    })

    constructor() {
        super("projects", "projects")
    }

    protected handleTags(
        _tags: string,
        data: { removed?: number; added?: ProjectExtra; updated?: ProjectExtra },
    ) {
        // console.log("projects handle", _tags, data)

        // if (data.removed) {
        //     const index = this.state.projects.findIndex((p) => p.id === data.removed)
        //     if (index !== -1) {
        //         this.state.projects.splice(index, 1)
        //     }
        // }
        // if (data.added) {
        //     this.state.projects.push(
        //         makeSelectable({ ...data.added, name: data.added.path.split("/").pop() as string }),
        //     )
        //     this.state.projects.sort((a, b) =>
        //         a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
        //     )
        // }
        if (data.updated) {
            const index = this.state.projects.findIndex((p) => p.id === data.updated?.id)
            if (index !== -1) {
                this.state.projects[index].filesize = data.updated.filesize
                this.state.projects[index].image_count = data.updated.image_count
                this.state.projects[index].excluded = data.updated.excluded
                this.state.projects[index].modified = data.updated.modified
            }
        } else {
            this.loadProjects()
        }
    }

    onSelectedProjectsChanged = eventCallback<ProjectState[]>()

    async loadProjects() {
        const projects = await pdb.listProjects()
        va.set(
            this.state.projects,
            projects
                .map((p) => makeSelectable({ ...p, name: p.path.split("/").pop() as string }))
                .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
        )
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
        }
        this.setSelectedProjects([])
        await this.container.getService("scanner").syncProjects(stateUpdate.map((p) => p.path))
        await this.loadProjects()
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
            totalImages: snap.projects.reduce((acc, p) => acc + p.image_count, 0),
            totalSize: snap.projects.reduce((acc, p) => acc + p.filesize, 0),
        }
    }

    toggleShowEmptyProjects() {
        this.state.showEmptyProjects = !this.state.showEmptyProjects
        console.log("show empty", this.state.showEmptyProjects)
    }
}

export default ProjectsController
