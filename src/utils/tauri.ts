import { type SaveDialogOptions, save as tauriSave } from "@tauri-apps/plugin-dialog"

import { getOverrideOr } from "@/testHooks"

export async function save(options?: SaveDialogOptions): Promise<string | null> {
    return await getOverrideOr<string | null>(
        "saveDialogPath",
        async () => await tauriSave(options),
    )
}
