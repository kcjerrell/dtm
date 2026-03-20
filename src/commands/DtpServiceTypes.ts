import type { DrawThingsConfig, DrawThingsConfigGrouped } from "@/types"

export type ModelType = "None" | "Model" | "Lora" | "Cnet" | "Upscaler"

export interface Model {
    id: number
    model_type: ModelType
    filename: string
    name?: string | null
    version?: string | null
    count: number
}

export interface ProjectExtra {
    id: number
    fingerprint: string
    path: string
    watchfolder_id: number
    image_count: number | null
    last_id: number | null
    filesize: number | null
    modified: number | null
    missing_on: number | null
    excluded: boolean
    name: string
    full_path: string
    is_missing: boolean
    is_locked: boolean
    is_ready: boolean
}

export interface ImageExtra {
    id: number
    project_id: number
    model_id: number | null
    model_file: string | null
    prompt: string
    negative_prompt: string
    num_frames: number | null
    preview_id: number
    node_id: number
    has_mask: boolean
    has_depth: boolean
    has_pose: boolean
    has_color: boolean
    has_custom: boolean
    has_scribble: boolean
    has_shuffle: boolean
    start_width: number
    start_height: number
    upscaler_id: number | null
    upscaler_scale_factor: number | null
    refiner_id: number | null
    refiner_start: number | null
    template_id: number | null
    is_ready: boolean
    clip_id: number
    wall_clock: string
    seed: number
    sampler: number
    steps: number
    guidance_scale: number
    strength: number
    shift: number
    hires_fix: boolean
    tiled_decoding: boolean
    tiled_diffusion: boolean
    tea_cache: boolean
    cfg_zero_star: boolean
}

export interface ImageCount {
    project_id: number
    count: number
}

export interface ListImagesResult {
    counts: ImageCount[] | null
    images: ImageExtra[] | null
    total: number
}

export type FilterOperator =
    | "eq"
    | "neq"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "is"
    | "isnot"
    | "has"
    | "hasall"
    | "doesnothave"

export type FilterTarget =
    | "model"
    | "lora"
    | "control"
    | "sampler"
    | "content"
    | "seed"
    | "steps"
    | "width"
    | "height"
    | "textguidance"
    | "shift"

export interface ListImagesFilter {
    target: FilterTarget
    operator: FilterOperator
    value: string[] | number[]
}

export interface ImagesSource {
    projectIds?: number[]
    search?: string
    filters?: ListImagesFilter[]
    sort?: string
    direction?: "asc" | "desc"
    count?: boolean
    showVideo?: boolean
    showImage?: boolean
    showDisconnected?: boolean
}

export interface WatchFolder {
    id: number
    path: string
    recursive: boolean | null
    last_updated: number | null
    isMissing: boolean
    isLocked: boolean
    bookmark: string
}

export interface ClipFrame {
    tensorId: string
    previewId: number
    indexInAClip: number
    rowId: number
}

export interface ClipExtra {
    clip: Clip
    frames: ClipFrame[]
}

export interface Clip {
    rowId: number
    clipId: number
    count: number
    framesPerSecond: number
    width: number
    height: number
    audioId: number
}

export interface TensorSize {
    width: number
    height: number
    channels: number
}

export interface Control {
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

export interface LoRA {
    file?: string
    weight: number
    mode: string
}

export interface TensorRaw {
    tensor_type: number
    data_type: number
    format: number
    width: number
    height: number
    channels: number
    dim: ArrayBuffer
    data: ArrayBuffer
}

export interface DTImageFull {
    id: number
    prompt: string | null
    negativePrompt: string | null
    model: Model | null
    project: ProjectExtra
    config: DrawThingsConfig
    groupedConfig: DrawThingsConfigGrouped
    clipId: number
    numFrames: number
    node: XTensorHistoryNode
    images: {
        tensorId: string | null
        previewId: number
        maskId: string | null
        depthMapId: string | null
        scribbleId: string | null
        poseId: string | null
        colorPaletteId: string | null
        customId: string | null
        moodboardIds: string[]
    } | null
}

export interface XTensorHistoryNode {
    lineage: number
    logical_time: number
    start_width: number
    start_height: number
    seed: number
    steps: number
    guidance_scale: number
    strength: number
    model: string | null
    tensor_id: number
    mask_id: number
    wall_clock: string | null
    text_edits: number
    text_lineage: number
    batch_size: number
    sampler: number
    hires_fix: boolean
    hires_fix_start_width: number
    hires_fix_start_height: number
    hires_fix_strength: number
    upscaler: string | null
    scale_factor: number
    depth_map_id: number
    generated: boolean
    image_guidance_scale: number
    seed_mode: number
    clip_skip: number
    controls: Control[] | null
    scribble_id: number
    pose_id: number
    loras: LoRA[] | null
    color_palette_id: number
    mask_blur: number
    custom_id: number
    face_restoration: string | null
    clip_weight: number
    negative_prompt_for_image_prior: boolean
    image_prior_steps: number
    data_stored: number
    preview_id: number
    content_offset_x: number
    content_offset_y: number
    scale_factor_by_120: number
    refiner_model: string | null
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
    clip_l_text: string | null
    separate_open_clip_g: boolean
    open_clip_g_text: string | null
    speed_up_with_guidance_embed: boolean
    guidance_embed: number
    resolution_dependent_shift: boolean
    tea_cache_start: number
    tea_cache_end: number
    tea_cache_threshold: number
    tea_cache: boolean
    separate_t5: boolean
    t5_text: string | null
    tea_cache_max_skip_steps: number
    text_prompt: string | null
    negative_text_prompt: string | null
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

export interface TensorHistoryExtra {
    row_id: number
    lineage: number
    logical_time: number
    tensor_id: string | null
    mask_id: string | null
    depth_map_id: string | null
    scribble_id: string | null
    pose_id: string | null
    color_palette_id: string | null
    custom_id: string | null
    moodboard_ids: string[]
    history: XTensorHistoryNode
    project_path: string
}

export type ScanProgress = {
    projects_found: number
    projects_scanned: number
    images_found: number
    images_scanned: number
}
