import { invoke } from '@tauri-apps/api/core'

export async function createVideoFromFrames(imageId: number): Promise<string> {
    return await invoke('create_video_from_frames', { imageId })
}

export async function ffmpegCheck(): Promise<boolean> {
    return await invoke('ffmpeg_check')
}

export async function ffmpegDownload(): Promise<void> {
    return await invoke('ffmpeg_download')
}

export async function ffmpegCall(args: string[]): Promise<string> {
    return await invoke('ffmpeg_call', { args })
}
