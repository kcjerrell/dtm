// --------------------
// Type definitions
// --------------------

import { invoke } from "@tauri-apps/api/core"

export type ProjectExtra = {
	project_id: number
	path: string
	image_count: number
	last_id?: number
}

export type ImageExtra = {
	image_id: number
	project_id: number
	model_id?: number
	model_file?: string
	prompt?: string
	negative_prompt?: string
	dt_id: number
	row_id: number
	wall_clock: string // NaiveDateTime as ISO string
}

export type TensorHistoryExtra = {
	row_id: number
	lineage: number
	logical_time: number
	tensor_id?: string
	mask_id?: string
	depth_map_id?: string
	scribble_id?: string
	pose_id?: string
	color_palette_id?: string
	custom_id?: string
	history: Record<string, unknown>
	project_path: string
}

export type ScanProgress = {
	projects_scanned: number
	projects_total: number
	project_path: string
	images_scanned: number
	images_total: number
}

export type ListImagesOptions = {
	projectIds?: number[]
	sort?: string
	direction?: string
	model?: string
	promptSearch?: string
	take?: number
	skip?: number
}

// --------------------
// Command wrappers
// --------------------

export const projectsDb = {
	getImageCount: async (): Promise<number> => invoke("projects_db_get_image_count"),

	addProject: async (path: string): Promise<ProjectExtra> =>
		invoke("projects_db_add_project", { path }),

	removeProject: async (path: string): Promise<void> =>
		invoke("projects_db_remove_project", { path }),

	listProjects: async (): Promise<ProjectExtra[]> => invoke("projects_db_list_projects"),

	scanProject: async (path: string): Promise<void> => invoke("projects_db_scan_project", { path }),

	scanAllProjects: async (): Promise<void> => invoke("projects_db_scan_all_projects"),

	findImages: async (
		prompt_search: string,
		opts: ListImagesOptions,
	): Promise<{ items: ImageExtra[]; total: number }> =>
		invoke("projects_db_find_images", { prompt_search, ...opts }),

	listImages: async (opts: ListImagesOptions): Promise<{ items: ImageExtra[]; total: number }> =>
		invoke("projects_db_list_images", opts ?? {}),

	listWatchFolders: async (): Promise<Record<string, unknown>[]> =>
		invoke("projects_db_list_watch_folders"),

	addWatchFolder: async (path: string): Promise<Record<string, unknown>> =>
		invoke("projects_db_add_watch_folder", { path }),

	removeWatchFolders: async (paths: string[]): Promise<void> =>
		invoke("projects_db_remove_watch_folders", { paths }),
}

export const dtProject = {
	getTensorHistory: async (
		project_file: string,
		index: number,
		count: number,
	): Promise<Record<string, unknown>[]> =>
		invoke("dt_project_get_tensor_history", { project_file, index, count }),

	getThumbHalf: async (project_file: string, thumb_id: number): Promise<Uint8Array> =>
		invoke("dt_project_get_thumb_half", { project_file, thumb_id }),

	getHistoryFull: async (
		projectFile: string,
		skip: number,
		take: number,
	): Promise<TensorHistoryExtra[]> =>
		invoke("dt_project_get_history_full", { projectFile, skip, take }),

	getTensor: async (project_file: string, name: string): Promise<Uint8Array> =>
		invoke("dt_project_get_tensor", { project_file, name }),
}
