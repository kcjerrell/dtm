import { invoke } from "@tauri-apps/api/core"

export interface FramesExportOpts {
    imageId: number
    outputDir: string
    useTensor: boolean
    filenamePattern: string
    clipNumber?: number
    startFrame?: number
}

export interface VideoExportOpts {
    imageId: number
    outputFile: string
    useTensor: boolean
    fps: number
    width?: number
    height?: number
}

export interface NameOpts {
    pattern: string
    clipNumber?: number
    first?: number
    count: number
}

export interface CheckPatternResult {
    valid: boolean
    invalidReason?: string
    outputDirDne: boolean
    firstSafeIndex: number
    clipId: number
    examples: string[]
}

export async function ffmpegCheck(): Promise<boolean> {
    return await invoke("ffmpeg_check")
}

export async function ffmpegDownload(): Promise<void> {
    return await invoke("ffmpeg_download")
}

export async function ffmpegCall(args: string[]): Promise<string> {
    return await invoke("ffmpeg_call", { args })
}

export async function saveAllClipFrames(opts: FramesExportOpts): Promise<void> {
    return await invoke("save_all_clip_frames", { opts })
}

export async function createVideoFromFrames(opts: VideoExportOpts): Promise<string> {
    return await invoke("create_video_from_frames", { opts })
}

export async function checkPattern(
    pattern: string,
    dir: string,
    numFrames: number,
): Promise<CheckPatternResult> {
    return await invoke("check_pattern", { pattern, dir, numFrames })
}
