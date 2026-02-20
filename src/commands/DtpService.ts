import { type Channel, invoke } from "@tauri-apps/api/core"
import type { TensorHistoryClip } from "@/generated/types"
import type { ImagesSource as ListImagesOpts } from "../dtProjects/types"
import type {
    ImageExtra,
    ListImagesResult,
    Model,
    ModelType,
    ProjectExtra,
    TensorHistoryExtra,
    TensorSize,
    WatchFolder,
} from "./projects"

async function connect(channel: Channel) {
    await invoke("dtp_connect", { channel })
}

async function listProjects(watchFolderId?: number): Promise<ProjectExtra[]> {
    return await invoke("dtp_list_projects", { watchFolderId })
}

async function updateProject(projectId: number, exclude?: boolean): Promise<void> {
    return await invoke("dtp_update_project", { projectId, exclude })
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
    const result: ListImagesResult = await invoke("projects_db_image_list", opts)
    return result
}

async function findImageFromPreviewId(
    projectId: number,
    previewId: number,
): Promise<ImageExtra | undefined> {
    return await invoke("dtp_find_image_from_preview_id", { projectId, previewId })
}

async function getClip(imageId: number): Promise<TensorHistoryClip[]> {
    return await invoke("dtp_get_clip", { imageId })
}

async function listWatchFolders(): Promise<WatchFolder[]> {
    return await invoke("dtp_list_watch_folders")
}

async function pickWatchFolder(dtFolder?: boolean): Promise<void> {
    let testOverride = undefined
    if ((window as unknown as Record<string, string>).__E2E_FILE_PATH__) {
        testOverride = `TESTPATH::${(window as unknown as Record<string, string>).__E2E_FILE_PATH__}`
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

async function getHistoryFull(projectId: number, rowId: number): Promise<TensorHistoryExtra> {
    return await invoke("dtp_get_history_full", { projectId, rowId })
}

async function getTensorSize(projectId: number, tensorId: string): Promise<TensorSize> {
    return await invoke("dtp_get_tensor_size", { projectId, tensorId })
}

async function decodeTensor(
    projectId: number,
    tensorId: string,
    asPng: boolean,
    nodeId?: number,
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

const DTPService = {
    connect,
    listProjects,
    updateProject,
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
}

export default DTPService
