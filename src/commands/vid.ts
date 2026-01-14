import { invoke } from '@tauri-apps/api/core'

export async function createVideoFromFrames(imageId: number): Promise<string> {
    return await invoke('create_video_from_frames', { imageId })
}
