import {
    type OpenDialogOptions,
    type SaveDialogOptions,
    open as tauriOpen,
    save as tauriSave,
} from "@tauri-apps/plugin-dialog"

import { getOverrideOr } from "@/testHooks"

export async function save(options?: SaveDialogOptions): Promise<string | null> {
    return await getOverrideOr<string | null>(
        "saveDialogPath",
        async () => await tauriSave(options),
    )
}

export async function openFolder(options?: OpenDialogOptions): Promise<string | null> {
    return await getOverrideOr<string | null>("openFolderPath", async () => {
        const result = await tauriOpen({ ...options, directory: true, multiple: false })
        return (result as string | null) ?? null
    })
}
