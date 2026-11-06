import * as plist from "plist"
import { DtpService } from "@/commands"
import DTProject from "@/commands/DTProject"
import {
    type MediaItemSource,
    VALID_IMAGE_TYPES,
    VALID_VIDEO_TYPES,
} from "@/state/mediaStore/types"
import { getOverrideOr } from "@/testHooks"
import {
    fetchImage,
    getClipboardBinary,
    getClipboardText,
    getClipboardTypes,
    getLocalImage,
} from "@/utils/clipboard"
import { determineType } from "@/utils/mediaTypes"
import { drawPose } from "@/utils/pose"
import { getDrawThingsDataFromExif } from "../helpers"
import { getExif } from "./imageMetadata"
import { tryRead } from "./utiReaders"

export type LoadedImage = {
    buffer: Uint8Array
    type: string
    source?: MediaItemSource
}

export type LoadedVideo = {
    kind: "file" | "url"
    location: string
    type: string
    source?: MediaItemSource
}

export type LoadedMedia = LoadedImage | LoadedVideo

const prioritizedTypes = [
    "NSFilenamesPboardType",
    "public.utf8-plain-text",
    "public.html",
    "org.chromium.source-url",
    "public.png",
    "public.tiff",
    "public.jpeg",
    "public.webp",
    "public.file-url",
    "public.url",
]

export const clipboardTextTypes = [
    "NSFilenamesPboardType",
    "public.html",
    "public.utf8-plain-text",
    "org.chromium.source-url",
    "public.file-url",
    "public.url",
]

/** Select candidates before saving anything to a collection. */
export async function loadImageFromPasteboard(
    pasteboard: "general" | "drag",
): Promise<LoadedImage[]> {
    return (await collectPasteboard(pasteboard, false)) as LoadedImage[]
}

export async function loadMediaFromPasteboard(
    pasteboard: "general" | "drag",
): Promise<LoadedMedia[]> {
    return collectPasteboard(pasteboard, true)
}

async function collectPasteboard(pasteboard: "general" | "drag", includeVideo: boolean) {
    let firstItem: LoadedMedia | undefined
    for await (const result of loadItems(pasteboard, includeVideo)) {
        if (!result) continue
        // Finder supplies distinct files, not alternate representations of one image.
        if (Array.isArray(result)) return result

        firstItem ??= result
        if ("kind" in result) continue
        try {
            if (getDrawThingsDataFromExif(await getExif(result.buffer))) return [result]
        } catch (e) {
            console.warn("couldn't check pasteboard image metadata", e)
        }
    }
    return firstItem ? [firstItem] : []
}

async function* loadItems(
    pasteboard: "general" | "drag",
    includeVideo = false,
): AsyncGenerator<LoadedMedia | LoadedMedia[] | undefined> {
    const types = await getOverrideOr(
        "pasteboardTypes",
        async () => await getClipboardTypes(pasteboard),
    )

    const text = await getOverrideOr(
        "pasteboardText",
        async () =>
            await getClipboardText(
                clipboardTextTypes.filter((t) => types.includes(t)),
                pasteboard,
            ),
    )

    const getType = async (type: string) => {
        if (!types.includes(type)) return null
        if (type in text) return text[type]
        return await getClipboardBinary(type, pasteboard)
    }

    const source: MediaItemSource = {
        loadedFrom: pasteboard === "general" ? "clipboard" : "drop",
    }

    for (const uti of prioritizedTypes) {
        try {
            if (!types.includes(uti)) continue

            const data = await getType(uti)
            if (!data) continue

            const result = tryRead(uti, data)
            if (!result) continue

            const utiSource = { ...source, uti }

            if (result.pose) {
                yield await loadImageFromPose(data as string, utiSource)
                return
            }

            // Special handling for bulk file loading
            if (uti === "NSFilenamesPboardType" && result.urls) {
                const items: LoadedMedia[] = []
                for (const url of result.urls) {
                    const item = await (includeVideo ? loadMediaFromUrl : loadImageFromUrl)(url, {
                        ...utiSource,
                        url,
                    })
                    if (item) items.push(item)
                }
                yield items
                return
            }

            // Handle binary data from clipboard
            if (result.data) {
                const item = await loadImageFromBuffer(
                    result.data.buffer,
                    result.data.type,
                    utiSource,
                )
                if (item) yield item
            }

            // Handle URLs (web or local)
            if (result.urls) {
                for (const url of result.urls) {
                    const item = await (includeVideo ? loadMediaFromUrl : loadImageFromUrl)(url, {
                        ...utiSource,
                        url,
                    })
                    if (item) yield item
                }
            }

            // Handle DTP internal references
            if (result.dtpImage) {
                const item = await loadImageFromDtp(
                    result.dtpImage.projectId,
                    result.dtpImage.imageId,
                )
                if (item) yield item
            }
        } catch (e) {
            console.warn(`Error processing UTI ${uti}:`, e)
        }
    }
}

function preprocess(input: string) {
    try {
        if (
            typeof input === "string" &&
            (input.startsWith("https://cdn.discordapp.com") ||
                input.startsWith("https://media.discordapp.net"))
        ) {
            const url = new URL(input)
            url.searchParams.delete("format")
            url.searchParams.delete("quality")
            url.searchParams.delete("width")
            url.searchParams.delete("height")
            return url.toString()
        }
    } catch (e) {
        console.warn(`Error preprocessing input:`, e)
    }
    return input
}

/**
 * takes a text clipboard entry of the given type and returns all found
 * file paths, urls or dtp images
 */
export function parseText(value: string, type: string) {
    let paths: string[] = []
    let text: string = ""

    if (typeof value !== "string") return { files: [], urls: [] }

    switch (type) {
        case "NSFilenamesPboardType":
            // when copying from mac finder
            paths = plist.parse(value) as string[]
            text = paths.map((f) => `'${f}'`).join(" ")
            break
        case "public.html": {
            const src = extractImgSrc(value)
            if (src) text = src
            break
        }
        case "public.file-url":
        case "public.url":
        case "org.chromium.source-url":
        case "public.utf8-plain-text":
            text = value
            break
    }

    return extractPaths(text)
}

/**
 * When copying or dragging an image from chromium, public.html will have a single
 * <img> element. This will return the value of the src attribute
 * @param htmlString html containing a single img element
 * @returns img.src
 */
export function extractImgSrc(htmlString: string): string | null {
    try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(htmlString, "text/html")
        const img = doc.querySelector("img")
        return img?.getAttribute("src") ?? null
    } catch {
        return null
    }
}

export function getLocalPath(path: string) {
    let p = path

    if (p.startsWith("asset://")) p = p.slice(8)
    if (p.startsWith("file://")) p = p.slice(7)
    if (p.startsWith("/.file")) return null
    if (p.startsWith("/")) return p

    return null
}

export function extractPaths(text: string): {
    urls?: string[]
    dtpImage?: { projectId: number; imageId: number }
} {
    const urls: string[] = []

    const dtpImageRegex = /^dtm:\/\/dtproject\/thumb(?:half)?\/(\d+)\/(\d+)/gm
    const dtpMatch = dtpImageRegex.exec(text)
    if (dtpMatch) {
        const dtpImage = { projectId: Number(dtpMatch[1]), imageId: Number(dtpMatch[2]) }
        return { dtpImage }
    }

    // Regex for detecting quoted or unquoted chunks (handles spaces inside quotes)
    const chunkRegex = /'([^']+)'|"([^"]+)"|(\S+)/g

    // Regex for URLs
    const urlRegex = /^https?:\/\/[^\s'"]+$/i

    // Regex for absolute Unix-style file paths (/Users/... or ~/...)
    const fileRegex = /^(\/|~\/)[\w\d@%_\-.+!#$^&*()[\]{}:;'",?=/ ]+$/

    let match: RegExpExecArray | null = chunkRegex.exec(text)
    while (match !== null) {
        const candidate = (match[1] || match[2] || match[3] || "").trim()

        if (!candidate) {
            match = chunkRegex.exec(text)
            continue
        }

        if (urlRegex.test(candidate)) {
            urls.push(candidate)
        } else if (fileRegex.test(candidate)) {
            urls.push(candidate)
        }
        // ❌ anything else gets ignored (random words, etc.)
        match = chunkRegex.exec(text)
    }

    return { urls }
}

export async function loadImageFromBuffer(
    buffer: Uint8Array | null | undefined,
    type: string,
    source?: MediaItemSource,
): Promise<LoadedImage | undefined> {
    // Video acquisition is deliberately left to the upcoming video migration.
    if (!buffer?.length || !VALID_IMAGE_TYPES.includes(type)) return undefined
    return { buffer, type, source }
}

export async function loadMediaFromFile(
    file: string,
    source?: MediaItemSource,
): Promise<LoadedMedia | undefined> {
    const normalized = file.startsWith("files://") ? file.replace("files://", "file://") : file
    try {
        const filePath = normalized.startsWith("file://")
            ? decodeURIComponent(new URL(normalized).pathname)
            : normalized
        const type = determineType(filePath)
        if (type && VALID_VIDEO_TYPES.includes(type)) {
            return {
                kind: "file",
                location: filePath,
                type,
                source: { ...source, file: filePath, url: null },
            }
        }
    } catch (e) {
        console.warn("couldn't load media from file", file, e)
        return undefined
    }
    return loadImageFromFile(file, source)
}

export async function loadMediaFromUrl(
    url: string,
    source?: MediaItemSource,
): Promise<LoadedMedia | undefined> {
    url = preprocess(url)
    if (isLocalUrl(url)) return loadMediaFromFile(url, source)
    const type = determineType(url)
    if (type && VALID_VIDEO_TYPES.includes(type)) {
        return { kind: "url", location: url, type, source: { ...source, url } }
    }
    return loadImageFromUrl(url, source)
}

export async function loadImageFromFile(
    file: string,
    source?: MediaItemSource,
): Promise<LoadedImage | undefined> {
    try {
        const normalized = file.startsWith("files://") ? file.replace("files://", "file://") : file
        const filePath = normalized.startsWith("file://")
            ? decodeURIComponent(new URL(normalized).pathname)
            : normalized
        const fileType = determineType(filePath)
        if (fileType && VALID_VIDEO_TYPES.includes(fileType)) return undefined
        const data = await getLocalImage(filePath)
        if (!data) return undefined
        const type = fileType ?? determineType(data)
        if (!type) return undefined
        return await loadImageFromBuffer(data, type, { ...source, file: filePath })
    } catch (e) {
        console.warn("couldn't load image from file", file, e)
        return undefined
    }
}

/** Accepts a remote URL or a local file path/URL. */
export async function loadImageFromUrl(
    url: string,
    source?: MediaItemSource,
): Promise<LoadedImage | undefined> {
    url = preprocess(url)
    if (isLocalUrl(url)) return loadImageFromFile(url, { ...source, url: null })

    const urlType = determineType(url)
    if (urlType && VALID_VIDEO_TYPES.includes(urlType)) return undefined
    const fetched = await fetchImage(url)
    if (!fetched) return undefined
    const type = determineType(fetched.type)
    if (!type) return undefined
    return loadImageFromBuffer(fetched.data, type, { ...source, url })
}

export async function loadImageFromDtp(
    projectId: number,
    imageId: number,
): Promise<LoadedImage | undefined> {
    try {
        const result = await loadDtpImage({ projectId, imageId })
        if (!result) return undefined
        return await loadImageFromBuffer(result.image, "png", {
            loadedFrom: "project",
            projectFile: result.projectFile,
            nodeId: result.history.rowid,
            tensorId: result.history.tensorHistoryName,
        })
    } catch (e) {
        console.warn("couldn't load image from dtp image", projectId, imageId, e)
        return undefined
    }
}

export async function loadImageFromPose(
    data: string,
    source?: MediaItemSource,
): Promise<LoadedImage | undefined> {
    const pose = JSON.parse(data)
    const buffer = await drawPose(pose)
    return loadImageFromBuffer(buffer, "png", { ...source, pose })
}

export async function loadDtpImage(dtpImage: { projectId: number; imageId: number }) {
    const { projectId, imageId } = dtpImage
    const history = await DTProject.listTensorHistoryNodes({
        projectId,
        previewId: imageId,
        select: "tensordata",
    })
    if (!history[0]) return
    const image = await DtpService.getResourceImage(
        projectId,
        history[0].rowid,
        history[0].tensorHistoryName,
    )
    return { image, projectFile: history[0].project_path, history: history[0] }
}

export function isLocalUrl(url: string): boolean {
    if (url.startsWith("/") || url.startsWith("file://") || url.startsWith("files://")) return true
    try {
        const parsed = new URL(url)
        return parsed.protocol !== "http:" && parsed.protocol !== "https:"
    } catch {
        return true
    }
}
