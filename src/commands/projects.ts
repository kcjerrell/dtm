import { invoke } from "@tauri-apps/api/core"

// --------------------
// Type definitions
// --------------------

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

export type Control = {
	file?: string
	weight: number
	guidance_start: number
	guidance_end: number
	no_prompt: boolean
	global_average_pooling: boolean
	down_sampling_rate: number
	control_mode: string
	target_blocks?: string[]
	input_override: string
}

export type LoRA = {
	file?: string
	weight: number
	mode: string
}

export type TensorHistoryNode = {
	lineage: number
	logical_time: number
	start_width: number
	start_height: number
	seed: number
	steps: number
	guidance_scale: number
	strength: number
	model?: string
	tensor_id: number
	mask_id: number
	wall_clock?: string
	text_edits: number
	text_lineage: number
	batch_size: number
	sampler: number
	hires_fix: boolean
	hires_fix_start_width: number
	hires_fix_start_height: number
	hires_fix_strength: number
	upscaler?: string
	scale_factor: number
	depth_map_id: number
	generated: boolean
	image_guidance_scale: number
	seed_mode: number
	clip_skip: number
	controls?: Control[]
	scribble_id: number
	pose_id: number
	loras?: LoRA[]
	color_palette_id: number
	mask_blur: number
	custom_id: number
	face_restoration?: string
	clip_weight: number
	negative_prompt_for_image_prior: boolean
	image_prior_steps: number
	data_stored: number
	preview_id: number
	content_offset_x: number
	content_offset_y: number
	scale_factor_by_120: number
	refiner_model?: string
	original_image_height: number
	original_image_width: number
	crop_top: number
	crop_left: number
	target_image_height: number
	target_image_width: number
	aesthetic_score: number
	negative_aesthetic_score: number
	zero_negative_prompt: boolean
	refiner_start: number
	negative_original_image_height: number
	negative_original_image_width: number
	shuffle_data_stored: number
	fps_id: number
	motion_bucket_id: number
	cond_aug: number
	start_frame_cfg: number
	num_frames: number
	mask_blur_outset: number
	sharpness: number
	shift: number
	stage_2_steps: number
	stage_2_cfg: number
	stage_2_shift: number
	tiled_decoding: boolean
	decoding_tile_width: number
	decoding_tile_height: number
	decoding_tile_overlap: number
	stochastic_sampling_gamma: number
	preserve_original_after_inpaint: boolean
	tiled_diffusion: boolean
	diffusion_tile_width: number
	diffusion_tile_height: number
	diffusion_tile_overlap: number
	upscaler_scale_factor: number
	script_session_id: number
	t5_text_encoder: boolean
	separate_clip_l: boolean
	clip_l_text?: string
	separate_open_clip_g: boolean
	open_clip_g_text?: string
	speed_up_with_guidance_embed: boolean
	guidance_embed: number
	resolution_dependent_shift: boolean
	tea_cache_start: number
	tea_cache_end: number
	tea_cache_threshold: number
	tea_cache: boolean
	separate_t5: boolean
	t5_text?: string
	tea_cache_max_skip_steps: number
	text_prompt?: string
	negative_text_prompt?: string
	clip_id: number
	index_in_a_clip: number
	causal_inference_enabled: boolean
	causal_inference: number
	causal_inference_pad: number
	cfg_zero_star: boolean
	cfg_zero_init_steps: number
	generation_time: number
	reason: number
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
	history: TensorHistoryNode
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
	nodeId?: number
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

	updateExclude: async (id: number, exclude: boolean): Promise<void> =>
		invoke("projects_db_project_update_exclude", { id, exclude }),

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
		): Promise<WatchFolder> =>
			invoke("projects_db_watch_folder_add", { path, itemType, recursive }),

		remove: async (ids: number[] | number): Promise<void> =>
			invoke("projects_db_watch_folder_remove", { ids: Array.isArray(ids) ? ids : [ids] }),

		update: async (id: number, recursive: boolean): Promise<WatchFolder> =>
			invoke("projects_db_watch_folder_update", { id, recursive }),
	},

	scanModelInfo: async (filePath: string, modelType: ModelType): Promise<void> =>
		invoke("projects_db_scan_model_info", { filePath, modelType }),
}

export type ModelType = "Model" | "Lora" | "Cnet" | "Upscaler"

export type ModelInfo = {
	file: string
	name: string
	version: string
	model_type: ModelType
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
