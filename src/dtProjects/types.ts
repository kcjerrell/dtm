export type ScanProgress = {
	projects_scanned: number
	projects_total: number
	project_path: string
	images_scanned: number
	images_total: number
}
export type ScanProgressEvent = {
	payload: ScanProgress
}

export type DTProject = {
	project_id: number
	path: string
	image_count: number
	scanningStatus?: "waiting" | "scanning" | "scanned"
}

export type DTImage = {
	image_id: number
	project_id: number
	model_id: number
	model_file: string
	prompt: string
	negative_prompt: string
	dt_id: number
	row_id: number
	wall_clock: string
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
	wall_clock: number
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
	controls?: Record<string, unknown>[]
	scribble_id: number
	pose_id: number
	loras?: Record<string, unknown>[]
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
	// profile_data: Option<flatbuffers::WIPOffset<flatbuffers::Vector<'a, number>>>,
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

export interface TensorHistoryExtra {
	rowId: number
	lineage: number
	logicalTime: number

	tensorId?: string | null
	maskId?: string | null
	depthMapId?: string | null
	scribbleId?: string | null
	poseId?: string | null
	colorPaletteId?: string | null
	customId?: string | null

	history: TensorHistoryNode
	projectPath: string
}