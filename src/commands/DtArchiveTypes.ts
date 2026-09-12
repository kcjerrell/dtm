export type CreateDtArchiveOptions = {
    /** Project to archive. */
    projectId: number
    /** Whether to use PNG instead of JPEG for archived images. */
    lossless: boolean
    /** JPEG quality; this may also be used as the PNG effort. */
    quality: number
    /** Directory where the archive will be saved. */
    target: string
}

export type TensorCounts = {
    tensorHistory: number
    binaryMask: number
    shuffle: number
    custom: number
    depthMap: number
    colorPalette: number
    audio: number
    scribble: number
}

export type DtArchivePreview = {
    genImages: number
    genVideos: number
    videoFrames: number
    tensors: TensorCounts
    /** The number of primary tensors (DTM-indexed images that are gen=true) */
    primaryTensors: number
    /** The number of extra tensors */
    extraTensors: number
    /** Number and total byte size of half-size thumbnails included in the archive. */
    thumbhalf: [number, number]
    /** Current project file size in bytes. */
    filesize: number
    /** Estimated archive size in bytes. */
    estimate: number
    /** Whether Draw Things currently has the project open. */
    fileInUse: boolean
}
