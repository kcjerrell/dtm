import { invoke } from '@tauri-apps/api/core'
import { open } from "@tauri-apps/plugin-dialog"
import { readDir } from '@tauri-apps/plugin-fs'
import { DTProject } from '../types'
import DTProjects from './projectStore'
import { path } from '@tauri-apps/api'

export async function addProject(directory = false) {
	const result = await open({
		multiple: !directory,
		directory,
		defaultPath: "/Users/kcjer/Library/Containers/com.liuliu.draw-things/Data/Documents",
		filters: [
			{
				name: "Draw Things Projects",
				extensions: ["sqlite3"],
			},
		],
	})

	if (!result) return
	const files: string[] = []

	if (directory) {
		const dirFiles = (await readDir(result)).filter((f) => f.name.endsWith(".sqlite3"))
		files.push(...(await Promise.all(dirFiles.map(async (f) => await path.join(result, f.name)))))
	} else if (Array.isArray(result)) {
		for (const file of result) {
			files.push(file)
		}
	}

	for (const file of files) {
		await invoke("projects_db_add_project", { path: file })
	}

	await loadProjects()
}

export async function loadProjects() {
	const projects = (await invoke("projects_db_list_projects")) as DTProject[]

	DTProjects.state.projects = projects.sort((a, b) =>
		a.path.toLowerCase().localeCompare(b.path.toLowerCase()),
	) as DTProject[]
}

export async function scanProject(projectFile: string) {
	await invoke("projects_db_scan_project", { path: projectFile })
	await loadProjects()
}

export async function scanAllProjects() {
	const start = Date.now()
	await invoke("projects_db_scan_all_projects")
	const end = Date.now()
	await loadProjects()
	DTProjects.state.scanProgress = -1
	console.log({ end, start }, end - start)
}

export async function removeProject(projectFile: string) {
	await invoke("projects_db_remove_project", { path: projectFile })
	await loadProjects()
}