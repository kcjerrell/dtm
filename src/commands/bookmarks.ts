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
    return await invoke("pick_folder", { defaultPath, buttonText });
}
