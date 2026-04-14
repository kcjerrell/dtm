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
    audio?: [number, string]
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

export async function getVideoMetadata(path: string): Promise<Record<string, unknown>> {
    const data = await invoke("get_video_metadata", { path })
    const ob = JSON.parse(data as string)
    return parseKeys(ob)
}

function parseKeys<T = Record<string, unknown>>(object: T): T | Record<string, unknown> {
    if (typeof object !== "object" || object === null) return object
    if (Array.isArray(object)) {
        return object.map(parseKeys) as T
    }
    const ob = object as Record<string, unknown>
    for (const key in ob) {
        const value = ob[key]
        if (typeof value === "object" && value !== null) {
            ob[key] = parseKeys(value)
        }
        if (maybeJson(value)) {
            try {
                ob[key] = JSON.parse(value)
            } catch {
                // ignore
            }
        }
    }
    return ob
}

function maybeJson(value: unknown): value is string {
    if (typeof value !== "string") return false
    if (value.startsWith("{") && value.endsWith("}")) return true
    if (value.startsWith("[") && value.endsWith("]")) return true
    return false
}

export async function getVideoThumbnail(path: string): Promise<Uint8Array> {
    return new Uint8Array(await invoke("get_video_thumbnail", { path }))
}
