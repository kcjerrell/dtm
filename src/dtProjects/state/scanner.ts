import { stat } from "@tauri-apps/plugin-fs"
import { pdb } from "@/commands"
import type { DTProjectsStateType, IDTProjectsStore } from "./projectStore"
import type { ProjectState } from "./projects"

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
		await this.syncProjects()
		await this.scanModelFiles()
	}

	// updated scan projects method
	async syncProjects() {
		await this.#dtp.projects.loadProjects()
		await this.#dtp.watchFolders.loadWatchFolders()
		await this.syncProjectFiles()
		for (const project of this.#state.projects) {
			await this.syncProject(project)
		}
		await pdb.rebuildIndex()

		this.#dtp.watchFolders.startWatch(async (projectFiles) => {
			for (const projectFile of projectFiles) {
				let project = this.#state.projects.find((p) => p.path === projectFile)
				if (!project) {
					await this.#dtp.projects.addProjects([projectFile])
					project = this.#state.projects.find((p) => p.path === projectFile)
				}
				if (project) {
					await this.syncProject(project)
				}
			}
		})
	}

	// ensure every project in the watch folders is in the db
	async syncProjectFiles() {
		const { watchFolders: WatchFolders, projects: Projects } = this.#dtp
		const newProjects = [] as string[]

		for (const folder of this.#state.watchFolders.projectFolders) {
			const folderProjects = await WatchFolders.listProjects(folder)
			for (const projectPath of folderProjects) {
				const project = this.#state.projects.find((p) => p.path === projectPath)
				if (!project) newProjects.push(projectPath)
			}
		}

		if (newProjects.length > 0) await Projects.addProjects(newProjects)
	}

	/** @param skipCheck if true, will check even if filesize and modified are the same */
	async syncProject(project: ProjectState, skipCheck?: boolean) {
		if (skipCheck) {
			await pdb.scanProject(project.path, false, project.filesize, project.modified)
		} else {
			const result = await checkProject(project)
			project.isMissing = result.isMissing

			if (result.action === "update") {
				await pdb.scanProject(project.path, false, result.filesize, result.modified)
				project.filesize = result.filesize
				project.modified = result.modified
			}
		}
	}

	private async scanModelFiles() {
		const { watchFolders: WatchFolders } = this.#dtp

		for (const folder of this.#state.watchFolders.modelInfoFolders) {
			const modelFiles = await WatchFolders.listModelInfoFiles(folder)

			for (const file of modelFiles) {
				await pdb.scanModelInfo(file.path, file.modelType)
			}
		}
	}
}

async function checkProject(project: ProjectState): Promise<CheckProjectResult> {
	if (project.excluded)
		return {
			action: "none",
			isMissing: false,
			filesize: 0,
			modified: 0,
		}

	const stats = await stat(project.path)
	if (!stats) {
		return {
			action: "none",
			isMissing: true,
			filesize: 0,
			modified: 0,
		}
	}

	const result = {
		action: "none",
		isMissing: false,
		filesize: stats.size,
		modified: stats.mtime?.getTime() || 0,
	}

	if (project.filesize !== stats.size) result.action = "update"
	if (project.modified !== stats.mtime?.getTime()) result.action = "update"

	return result as CheckProjectResult
}

type CheckProjectResult = {
	action: "none" | "update"
	isMissing: boolean
	filesize: number
	modified: number
}
