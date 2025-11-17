import { stat } from "@tauri-apps/plugin-fs"
import type { DTProjectsState, IDTProjectsStore } from "./projectStore"
import type { ProjectState } from "./projects"
import type WatchFolderService from "./watchFolders"
import { projectsDb } from "@/commands"

export class ScannerService {
	#dtp: IDTProjectsStore
	#state: DTProjectsState

	constructor(dtp: IDTProjectsStore) {
		this.#dtp = dtp
		this.#state = dtp.state
	}

	async scanAndWatch() {
		const { watchFolders: WatchFolders, projects: Projects } = this.#dtp
		await WatchFolders.loadWatchFolders()
		await Projects.loadProjects()

		// load list of projects mapped to {project, action}
		const projects = this.#state.projects.map((p) => ({
			project: p as ProjectState | Awaited<ReturnType<WatchFolderService["listProjects"]>>[number],
			action: "unknown",
		}))

		// read each watch folder, match against list
		for (const folder of this.#state.watchFolders) {
			const folderProjects = await WatchFolders.listProjects(folder)

			for (const projectFile of folderProjects) {
				const project = projects.find((p) => p.project.path === projectFile.path)
				// set action to add if not listed
				if (!project) {
					projects.push({ project: projectFile, action: "add" })
					continue
				}
				// set action to 'update' if filesize or mdate mismatch
				if (
					project.project.filesize !== projectFile.filesize ||
					project.project.modified !== projectFile.modified
				) {
					project.action = "update"
				} else {
					project.action = "none"
				}
			}

			// iterate through projects, project without action check stat and update action
			for (const project of projects) {
				if (project.action === "unknown") {
					const projectPath = project.project.path
					const stats = await stat(projectPath)
					if (!stats) {
						;(project.project as ProjectState).isMissing = true
						continue
					}
					if (
						(project.project as ProjectState).filesize !== stats.size ||
						(project.project as ProjectState).modified !== stats.mtime?.getTime()
					)
						project.action = "update"
				}

				// adds new projects
				if (project.action === "add") {
					const result = await Projects.addProjects([project.project.path])
					project.action = "update"
				}

				// update
				if (project.action === "update") {
					console.log("update ", project.project.path)
					await projectsDb.scanProject(
						project.project.path,
						false,
						project.project.filesize,
						project.project.modified,
					)
				}
			}
			// add watchers
		}
		await projectsDb.rebuildIndex()
	}
}
