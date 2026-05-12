import { type Channel, invoke } from "@tauri-apps/api/core"
import type {
    ClipExtra,
    ImageExtra,
    ImagesSource as ListImagesOpts,
    ListImagesResult,
    Model,
    ModelType,
    ProjectExtra,
    TensorHistoryExtra,
    TensorSize,
    WatchFolder,
} from "./DtpServiceTypes"
import { TensorHistoryNodeResponse } from "./DTProjectTypes"

type MaybeReadonly<T> = T | Readonly<T>

async function connect(channel: Channel) {
    await invoke("dtp_connect", { channel, autoWatch: true })
}

async function lockFolder(watchfolderId: number) {
    await invoke("dtp_lock_folder", { watchfolderId })
}

async function listProjects(watchfolderId?: number): Promise<ProjectExtra[]> {
    return await invoke("dtp_list_projects", { watchfolderId })
}

async function updateProjectExclude(projectId: number, exclude: boolean): Promise<void> {
    return await invoke("dtp_update_project_exclude", { projectId, exclude })
}

async function listImages(
    source: MaybeReadonly<ListImagesOpts>,
    skip: number,
    take: number,
): Promise<ListImagesResult> {
    const result: ListImagesResult = await invoke("dtp_list_images", {
        ...source,
        skip,
        take,
    })
    return result
}

async function listImagesCount(source: MaybeReadonly<ListImagesOpts>) {
    const opts = { ...source, projectIds: undefined, count: true }
    const result: ListImagesResult = await invoke("dtp_list_images", opts)
    return result
}

async function findImageFromPreviewId(
    projectId: number,
    previewId: number,
): Promise<ImageExtra | undefined> {
    return await invoke("dtp_find_image_from_preview_id", { projectId, previewId })
}

async function getClip(imageId: number, clipId: number): Promise<ClipExtra> {
    return await invoke("dtp_get_clip", { imageId, clipId })
}

async function listWatchFolders(): Promise<WatchFolder[]> {
    return await invoke("dtp_list_watch_folders")
}

async function pickWatchFolder(dtFolder?: boolean): Promise<void> {
    let testOverride = undefined
    if ((window as unknown as Record<string, string>).__E2E_FILE_PATH__) {
        testOverride = (window as unknown as Record<string, string>).__E2E_FILE_PATH__
        ;(window as unknown as Record<string, string>).__E2E_FILE_PATH__ = "" // Clear it after use
        // In E2E tests, we bypass the native picker and return a predefined path.
    }
    return await invoke("dtp_pick_watch_folder", { dtFolder, testOverride })
}

async function removeWatchFolder(id: number): Promise<void> {
    return await invoke("dtp_remove_watch_folder", { id })
}

async function updateWatchFolder(id: number, recursive: boolean): Promise<void> {
    return await invoke("dtp_update_watch_folder", { id, recursive })
}

async function listModels(modelType?: ModelType): Promise<Model[]> {
    return await invoke("dtp_list_models", { modelType })
}

async function getHistoryFull(
    projectId: number,
    rowId: number,
    clipId?: number | null,
): Promise<TensorHistoryNodeResponse> {
    return await invoke("dtp_get_history_full", { projectId, rowId, clipId })
}

async function getTensorSize(projectId: number, tensorId: string): Promise<TensorSize> {
    return await invoke("dtp_get_tensor_size", { projectId, tensorId })
}

async function decodeTensor(
    projectId: number,
    tensorId: string,
    asPng: boolean,
    nodeId?: number | null,
): Promise<Uint8Array<ArrayBuffer>> {
    const opts = {
        tensorId,
        projectId,
        asPng,
        nodeId,
    }
    return new Uint8Array(await invoke("dtp_decode_tensor", opts))
}

async function findPredecessor(
    projectId: number,
    rowId: number,
    lineage: number,
    logicalTime: number,
): Promise<TensorHistoryExtra[]> {
    return await invoke("dtp_find_predecessor", {
        projectId,
        rowId,
        lineage,
        logicalTime,
    })
}

async function sync() {
    await invoke("dtp_sync")
}

async function syncProjects(projectIds: number[]) {
    await invoke("dtp_sync_projects", { projectIds, checkDeletions: true })
}

const DTPService = {
    connect,
    listProjects,
    updateProjectExclude,
    listImages,
    listImagesCount,
    findImageFromPreviewId,
    getClip,
    listWatchFolders,
    pickWatchFolder,
    removeWatchFolder,
    updateWatchFolder,
    listModels,
    getHistoryFull,
    getTensorSize,
    decodeTensor,
    findPredecessor,
    sync,
    syncProjects,
    lockFolder,
}

export default DTPService
