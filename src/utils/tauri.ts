import { type SaveDialogOptions, save as tauriSave } from "@tauri-apps/plugin-dialog"

type E2EWindow = Window & {
    __E2E_FILE_PATH__?: string
}

function consumeE2EFilePathOverride(): string | null {
    const win = window as E2EWindow
    const override = win.__E2E_FILE_PATH__
    if (!override) return null
    win.__E2E_FILE_PATH__ = ""
    return override
}

export async function save(options?: SaveDialogOptions): Promise<string | null> {
    const override = consumeE2EFilePathOverride()
    if (override) return override
    return await tauriSave(options)
}
