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
