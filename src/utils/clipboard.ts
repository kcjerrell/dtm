import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import { writeImage, writeText } from "@tauri-apps/plugin-clipboard-manager"
import type { ImageSource } from "@/types"

type PasteboardNames = "general" | "drag"
export async function getClipboardTypes(pasteboard?: PasteboardNames): Promise<string[]> {
    return await invoke("read_clipboard_types", { pasteboard })
}

export async function getClipboardText(
    types: string[],
    pasteboard?: PasteboardNames,
): Promise<Record<string, string>> {
    return await invoke("read_clipboard_strings", { types: types, pasteboard })
}

export async function getClipboardBinary(
    type: string,
    pasteboard?: PasteboardNames,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
    const data = await invoke("read_clipboard_binary", { ty: type, pasteboard })

    if (data && Array.isArray(data)) {
        return new Uint8Array(data)
    }
}

export type ImageAndData = {
    data: Uint8Array
    source: ImageSource
    exif: ExifReader.Tags
    hasDrawThingsData: boolean
    type: string
}

export async function getLocalImage(path: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
    // console.log(path)
    // console.log(await exists(path))
    // try {
    // 	if (!(await exists(path))) return
    // 	const data = await readFile(path)
    // 	return data
    // } catch {
    // 	return undefined
    // }
    const response = await fetch(convertFileSrc(path), { cache: "no-store" })
    if (!response.ok) throw new Error(`Could not read image at ${path} (HTTP ${response.status})`)
    return new Uint8Array(await response.arrayBuffer())
}

export async function fetchImage(
    url: string,
): Promise<{ data: Uint8Array<ArrayBuffer>; type: string } | undefined> {
    const [data, type] = await invoke<[number[], string]>("fetch_image_file", { url })
    if (Array.isArray(data)) {
        return { data: new Uint8Array(data), type }
    }
}

export async function writeClipboardText(data: object | string) {
    const str = typeof data === "string" ? data : JSON.stringify(data)
    await writeText(str)
}

export async function writeClipboardImage(data: Uint8Array<ArrayBuffer>) {
    await writeImage(data)
}
