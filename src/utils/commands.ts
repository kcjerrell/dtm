import { invoke } from "@tauri-apps/api/core"

type ScanProjectOptions = {
  
}

const projectsDb = {
	async getImageCount() {
		return invoke("projects_db_get_image_count")
	},
	async addProject(path: string) {
		return invoke("projects_db_add_project", { path })
	},
	async removeProject(path: string) {
		return invoke("projects_db_remove_project", { path })
	},
	async listProjects() {
		return invoke("projects_db_list_projects")
	},
	async scanProject(path: string) {
		return invoke("projects_db_scan_project", { path })
	},
	async scanAllProjects(
		project_id: number,
		sort: string,
		direction: string,
		model: string,
		prompt_search: string,
		take: number,
		skip: number,
	) {
		return invoke("projects_db_scan_all_projects")
	},
	async findImage() {
		return invoke("projects_db_find_image")
	},
	async listImages() {
		return invoke("projects_db_list_images")
	},
}

const dtProject = {
	async dt_project_get_tensor_history() {},
	async dt_project_get_thumb_half() {},
}

const commands = {
	projectsDb,
	dtProject,
}

export default commands
