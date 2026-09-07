export type CreateDtArchiveOptions = {
    /** Project to archive. */
    project_id: number
    /** Whether to use PNG instead of JPEG for archived images. */
    lossless: boolean
    /** JPEG quality; this may also be used as the PNG effort. */
    quality: number
    /** Directory where the archive will be saved. */
    target: string
}

export type TensorCounts = {
    tensor_history: number
    binary_mask: number
    shuffle: number
    custom: number
    depth_map: number
    color_palette: number
    audio: number
    scribble: number
}

export type DtArchivePreview = {
    tensors: TensorCounts
    /** The number of primary tensors (DTM-indexed images that are gen=true) */
    primary_tensors: number
    /** The number of extra tensors */
    extra_tensors: number
    /** Number and total byte size of half-size thumbnails included in the archive. */
    thumbhalf: [number, number]
    /** Current project file size in bytes. */
    filesize: number
    /** Estimated archive size in bytes. */
    estimate: number
    /** Whether Draw Things currently has the project open. */
    file_in_use: boolean
}
