import { invoke } from "@tauri-apps/api/core"
import { type ProjectExtra, projectsDb } from "@/commands"
import type { DTProjectsState } from "./projectStore"

export interface ProjectState extends ProjectExtra {
	isScanning?: boolean
	isMissing?: boolean
}

class ProjectsService {
	#state: DTProjectsState

	constructor(state: DTProjectsState) {
		this.#state = state
	}

	async loadProjects() {
			const projects = await projectsDb.listProjects()

			this.#state.projects = projects.sort((a, b) =>
				a.path.toLowerCase().localeCompare(b.path.toLowerCase()),
			)
	}

	async removeProjects(projectFiles: string[]) {
		for (const projectFile of projectFiles) {
			await invoke("projects_db_remove_project", { path: projectFile })
		}
		await this.loadProjects()
	}

	async addProjects(projectFiles: string[]) {
			for (const pf of projectFiles) {
				await projectsDb.addProject(pf)
			}
			await this.loadProjects()
	}
}

export default ProjectsService