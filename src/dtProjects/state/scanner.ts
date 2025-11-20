import { stat } from "@tauri-apps/plugin-fs"
import { pdb } from "@/commands"
import type { DTProjectsStateType, IDTProjectsStore } from "./projectStore"
import type { ProjectState } from "./projects"
import type WatchFolderService from "./watchFolders"

export class ScannerService {
	#dtp: IDTProjectsStore
	#state: DTProjectsStateType

	constructor(dtp: IDTProjectsStore) {
		this.#dtp = dtp
		this.#state = dtp.state
	}

	async scanAndWatch() {
		const { watchFolders: WatchFolders, projects: Projects } = this.#dtp
		await WatchFolders.loadWatchFolders()
		await Projects.loadProjects()

		// load list of projects mapped to {project, action}
		await this.scanProjects()
		await this.scanModelFiles()
	}

	private async scanModelFiles() {
		const { watchFolders: WatchFolders } = this.#dtp

		for (const folder of this.#state.watchFolders.modelInfoFolders) {
			const modelFiles = await WatchFolders.listModelInfoFiles(folder)

			for (const file of modelFiles) {
				console.log("info file", file)
				await pdb.scanModelInfo(file.path, file.modelType)
			}
		}
	}

	private async scanProjects() {
		const { watchFolders: WatchFolders, projects: Projects } = this.#dtp

		const projects = this.#state.projects.map((p) => ({
			project: p as ProjectState | Awaited<ReturnType<WatchFolderService["listProjects"]>>[number],
			action: "unknown",
		}))

		projects.forEach((p) => {
			;(p as unknown as ProjectState).isScanning = true
		})

		// read each watch folder, match against list
		for (const folder of this.#state.watchFolders.projectFolders) {
			const folderProjects = await WatchFolders.listProjects(folder)

			for (const projectFile of folderProjects) {
				const projectEntity = projects.find((p) => p.project.path === projectFile.path)
				if (!projectEntity) projects.push({ project: projectFile, action: "add" })
				else projectEntity.action = determineScanAction(projectFile, projectEntity)
			}

			// iterate through projects, project without action check stat and update action
			for (const project of projects as { project: ProjectState; action: string }[]) {
				if (project.action === "unknown") {
					console.warn("Project action unknown? Is this happening?", project)
					const projectPath = project.project.path
					const stats = await stat(projectPath)
					if (!stats) {
						project.project.isMissing = true
						continue
					}
					project.action = "update"
				}

				// adds new projects
				if (project.action === "add") {
					await Projects.addProjects([project.project.path])
					project.action = "update"
				}

				// update
				if (project.action === "update") {
					await pdb.scanProject(
						project.project.path,
						false,
						project.project.filesize,
						project.project.modified,
					)
				}
			}
		}

		await pdb.rebuildIndex()
	}
}

function determineScanAction(
	projectFile: Partial<ProjectState>,
	projectEntity: { project: Partial<ProjectState>; action?: string },
) {
	// set action to 'update' if filesize or mdate mismatch
	if (
		projectEntity.project.filesize !== projectFile.filesize ||
		projectEntity.project.modified !== projectFile.modified
	) {
		return "update"
	} else {
		return "none"
	}
}
