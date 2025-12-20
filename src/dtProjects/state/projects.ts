import { proxy } from "valtio"
import { type ProjectExtra, pdb } from "@/commands"
import { DTPStateController } from "@/hooks/StateController"
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
	onSyncRequired: (projects?: ProjectState[]) => void = () => {
		console.warn("Projects may be out of sync, handler not assigned")
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
		await this.onSyncRequired(stateUpdate)
		await this.loadProjects()
	}

	getProjectFile(projectId?: number | null) {
		if (Number.isNaN(projectId)) return undefined
		return this.state.projects.find((p) => p.id === projectId)?.path
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
		this.onSelectedProjectsChanged(projects)
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
