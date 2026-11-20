import { invoke } from "@tauri-apps/api/core"
import type { CreateDtArchiveOptions, DtArchivePreview } from "./DtArchiveTypes"

export async function createDtArchive(opts: CreateDtArchiveOptions): Promise<void> {
    await invoke("create_dt_archive", { opts })
}

export async function createDtArchivePlan(opts: CreateDtArchiveOptions): Promise<DtArchivePreview> {
    return await invoke("create_dt_archive_plan", { opts })
}

export async function clearDtArchivePlanCache(): Promise<void> {
    await invoke("clear_dt_archive_plan_cache")
}
