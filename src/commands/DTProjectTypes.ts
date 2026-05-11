export type TensorHistoryNode = {
    rowid: number
    project_path: string
    /** will only be present if requested with projectId */
    projectId?: number
    lineage: number
    logical_time: number
    data: TensorHistoryNodeData
    tensordata?: TensorData[]
    clip?: Clip
    moodboard?: TensorMoodboardData[]
}

export type TensorHistoryNodeData = {
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
    compression_artifacts: number
    compression_artifacts_quality: number
    audio: boolean
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

export type TensorData = {
    rowid: number
    lineage: number
    logical_time: number
    idx: number
    tensor_name: string
    data: TensorDataParsed
}

export type TensorDataParsed = {
    lineage: number
    logical_time: number
    index: number
    x: number
    y: number
    width: number
    height: number
    scale_factor_by_120: number
    tensor_id: number
    mask_id: number
    depth_map_id: number
    scribble_id: number
    pose_id: number
    color_palette_id: number
    custom_id: number
}

export type TensorMoodboardData = {
    rowid: number
    lineage: number
    logical_time: number
    idx: number
    shuffle_id: number
    weight: number
    tensor_name: string
}

export type Clip = {
    clip_id: number
    count: number
    frames_per_second: number
    width: number
    height: number
    audio_id: number
}
