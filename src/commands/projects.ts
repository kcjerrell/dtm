// --------------------
// Type definitions
// --------------------

import { invoke } from "@tauri-apps/api/core"

export type ProjectExtra = {
	id: number
	path: string
	image_count: number
	last_id?: number
	filesize: number
	modified: number
	excluded: boolean
}

export type ImageExtra = {
	id: number
	project_id: number
	model_id?: number
	model_file?: string
	prompt?: string
	negative_prompt?: string
	preview_id: number
	node_id: number
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
	moodboard_ids: string[]
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

export type TensorRaw = {
	tensor_type: number
	data_type: number
	format: number
	width: number
	height: number
	channels: number
	dim: ArrayBuffer
	data: ArrayBuffer
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

export type WatchFolder = {
	id: number
	path: string
	recursive: boolean
	item_type: "Projects" | "ModelInfo"
}

// --------------------
// Command wrappers
// --------------------

export const pdb = {
	// #unused
	getImageCount: async (): Promise<number> => invoke("projects_db_image_count"),

	addProject: async (path: string): Promise<ProjectExtra> =>
		invoke("projects_db_project_add", { path }),

	removeProject: async (path: string): Promise<void> =>
		invoke("projects_db_project_remove", { path }),

	listProjects: async (): Promise<ProjectExtra[]> => invoke("projects_db_project_list"),

	scanProject: async (
		path: string,
		fullScan = false,
		filesize?: number,
		modified?: number,
	): Promise<void> => invoke("projects_db_project_scan", { path, fullScan, filesize, modified }),

	// #unused
	scanAllProjects: async (): Promise<void> => invoke("projects_db_project_scan_all"),

	listImages: async (opts: ListImagesOptions): Promise<{ items: ImageExtra[]; total: number }> =>
		invoke("projects_db_image_list", opts ?? {}),

	rebuildIndex: async (): Promise<void> => invoke("projects_db_image_rebuild_fts"),

	watchFolders: {
		listAll: async (): Promise<WatchFolder[]> => invoke("projects_db_watch_folder_list"),

		add: async (
			path: string,
			itemType: "Projects" | "ModelInfo",
			recursive: boolean,
		): Promise<WatchFolder> => invoke("projects_db_watch_folder_add", { path, itemType, recursive }),

		remove: async (ids: number[] | number): Promise<void> =>
			invoke("projects_db_watch_folder_remove", { ids: Array.isArray(ids) ? ids : [ids] }),
	},
}

export const dtProject = {
	// #unused
	getTensorHistory: async (
		project_file: string,
		index: number,
		count: number,
	): Promise<Record<string, unknown>[]> =>
		invoke("dt_project_get_tensor_history", { project_file, index, count }),

	// #unused
	getThumbHalf: async (project_file: string, thumb_id: number): Promise<Uint8Array> =>
		invoke("dt_project_get_thumb_half", { project_file, thumb_id }),

	getHistoryFull: async (projectFile: string, rowId: number): Promise<TensorHistoryExtra> =>
		invoke("dt_project_get_history_full", { projectFile, rowId }),

	// #unused
	getTensor: async (tensorId: string, project: string | number): Promise<Uint8Array> => {
		const opts = {
			tensorId,
			projectId: typeof project === "string" ? undefined : project,
			projectFile: typeof project === "string" ? project : undefined,
		}
		return invoke("dt_project_get_tensor", opts)
	},

	// #unused
	getTensorRaw: async (
		projectFile: string,
		projectId: number,
		tensorId: string,
	): Promise<TensorRaw> =>
		invoke("dt_project_get_tensor_raw", { projectFile, projectId, tensorId }),

	decodeTensor: async (
		project: string | number,
		tensorId: string,
		asPng: boolean,
		nodeId?: number,
	): Promise<Uint8Array> => {
		const opts = {
			tensorId,
			projectId: typeof project === "string" ? undefined : project,
			projectFile: typeof project === "string" ? project : undefined,
			asPng,
			nodeId,
		}
		return invoke("dt_project_decode_tensor", opts)
	},

	getPredecessorCandidates: async (
		projectFile: string,
		rowId: number,
		lineage: number,
		logicalTime: number,
	): Promise<TensorHistoryExtra[]> =>
		invoke("dt_project_find_predecessor_candidates", { projectFile, rowId, lineage, logicalTime }),
}
