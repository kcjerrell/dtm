import { invoke } from "@tauri-apps/api/core";

export interface PickFolderResult {
    path: string;
    bookmark: string;
}

/**
 * Opens a native folder picker on macOS to select the Draw Things Documents folder.
 * Returns both the selected folder's path and a base64-encoded security-scoped bookmark.
 * 
 * @param defaultPath Optional path to suggest in the picker.
 * @returns A PickFolderResult containing path and bookmark, or null if cancelled.
 */
export async function pickDrawThingsFolder(defaultPath?: string): Promise<PickFolderResult | null> {
    return await invoke("pick_draw_things_folder", { defaultPath });
}

/**
 * Resolves a security-scoped bookmark and starts accessing the resource.
 * Returns the local file path to the resource.
 * The internal cache ensures stopAccessing... is called only when the app exits.
 * 
 * @param bookmark The base64-encoded bookmark string to resolve.
 * @returns The resolved local path.
 */
export async function resolveBookmark(bookmark: string): Promise<string> {
    return await invoke("resolve_bookmark", { bookmark });
}
