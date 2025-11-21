import { invoke } from "@tauri-apps/api/core"
import { type ProjectExtra, pdb } from "@/commands"
import type { DTProjectsStateType, IDTProjectsStore } from "./projectStore"

export interface ProjectState extends ProjectExtra {
	name: string
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
		const projects = await pdb.listProjects()

		this.#state.projects = projects
			.map((p) => ({ ...p, name: p.path.split("/").pop() as string }))
			.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
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
}

export default ProjectsService
