import { invoke } from "@tauri-apps/api/core";

export interface PickFolderResult {
    path: string;
    bookmark: string;
}

/**
 * Opens a native folder picker on macOS.
 * Returns both the selected folder's path and a base64-encoded security-scoped bookmark.
 * 
 * @param defaultPath Optional path to suggest in the picker.
 * @param buttonText Optional text for the action button (default: "Select folder").
 * @returns A PickFolderResult containing path and bookmark, or null if cancelled.
 */
export async function pickFolder(defaultPath?: string, buttonText?: string): Promise<PickFolderResult | null> {
    let path = defaultPath
    if ((window as unknown as Record<string, string>).__E2E_FILE_PATH__) {
        path = `TESTPATH::${(window as unknown as Record<string, string>).__E2E_FILE_PATH__}`;
        (window as unknown as Record<string, string>).__E2E_FILE_PATH__ =  ""; // Clear it after use
        // In E2E tests, we bypass the native picker and return a predefined path.
    }
    return await invoke("pick_folder", { defaultPath: path, buttonText });
}
