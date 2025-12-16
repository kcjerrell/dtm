import { stat } from "@tauri-apps/plugin-fs"
import { pdb } from "@/commands"
import { DTPStateService } from "@/hooks/StateController"
import type ModelsController from "./models"
import type ProjectsController from "./projects"
import type { ProjectState } from "./projects"
import type WatchFoldersController from "./watchFolders"

class ScannerService extends DTPStateService {
	projects: ProjectsController
	watchFolders: WatchFoldersController
	models: ModelsController

	constructor(
		projects: ProjectsController,
		watchFolders: WatchFoldersController,
		models: ModelsController,
	) {
		super()
		this.projects = projects
		this.projects.onSyncRequired = () => {
			this.syncProjects()
		}

		this.watchFolders = watchFolders
		this.watchFolders.onScanRequired = () => {
			this.scanAndWatch()
		}

		this.models = models
	}

	async scanAndWatch() {
		await this.watchFolders.loadWatchFolders()
		await this.projects.loadProjects()

		// load list of projects mapped to {project, action}
		await this.syncProjects()
		await this.scanModelFiles()
	}

	// updated scan projects method
	async syncProjects() {
		await this.projects.loadProjects()
		await this.watchFolders.loadWatchFolders()
		await this.syncProjectFiles()
		for (const project of this.projects.state.projects) {
			await this.syncProject(project)
		}
		await pdb.rebuildIndex()

		this.watchFolders.startWatch(async (projectFiles) => {
			for (const projectFile of projectFiles) {
				let project = this.projects.state.projects.find((p) => p.path === projectFile)
				if (!project) {
					await this.projects.addProjects([projectFile])
					project = this.projects.state.projects.find((p) => p.path === projectFile)
				}
				if (project) {
					await this.syncProject(project)
				}
			}
		})
	}

	// ensure every project in the watch folders is in the db
	async syncProjectFiles() {
		const newProjects = [] as string[]

		for (const folder of this.watchFolders.state.projectFolders) {
			const folderProjects = await this.watchFolders.listProjects(folder)
			for (const projectPath of folderProjects) {
				const project = this.projects.state.projects.find((p) => p.path === projectPath)
				if (!project) newProjects.push(projectPath)
			}
		}

		if (newProjects.length > 0) await this.projects.addProjects(newProjects)
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
		for (const folder of this.watchFolders.state.modelInfoFolders) {
			const modelFiles = await this.watchFolders.listModelInfoFiles(folder)

			for (const file of modelFiles) {
				await pdb.scanModelInfo(file.path, file.modelType)
			}
		}
	}
}

export default ScannerService

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
