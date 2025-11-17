import { invoke } from "@tauri-apps/api/core"
import { type ProjectExtra, projectsDb } from "@/commands"
import type { DTProjectsStateType, IDTProjectsStore } from "./projectStore"

export interface ProjectState extends ProjectExtra {
	isScanning?: boolean
	isMissing?: boolean
}

class ProjectsService {
	#dtp: IDTProjectsStore
	#state: DTProjectsStateType

	constructor(dtp: IDTProjectsStore) {
		this.#dtp = dtp
		this.#state = dtp.state
	}

	async loadProjects() {
			const projects = await projectsDb.listProjects()

			this.#state.projects = projects.sort((a, b) =>
				a.path.toLowerCase().localeCompare(b.path.toLowerCase()),
			)
			console.log('loaded projects')
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