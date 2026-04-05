import plist from "plist"
import { getClipboardBinary, getClipboardText, getClipboardTypes } from "@/utils/clipboard"
import { settledValues } from "@/utils/helpers"
import { isVideo } from "@/utils/imageStore"
import { determineType } from "@/utils/mediaTypes"
import { isOpenPose } from "@/utils/poseHelpers"
import { ImageItem } from "./ImageItem"
import type MediaItem from "./MediaItem"
import type { MediaItemSource } from "./MediaItem"
import { addImageItem } from "./metadataStore"
import { tryRead } from "./utiReaders"
import { VideoItem } from "./VideoItem"

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

export async function loadImage2(pasteboard: "general" | "drag") {
    let firstItem: MediaItem | null = null

    for await (const result of loadItems(pasteboard)) {
        if (!result) continue
        console.log("loaditem next", result)
        // Special case for NSFilenamesPboardType (array of items)
        if (Array.isArray(result)) {
            for (const item of result) {
                if (item) addImageItem(item)
            }
            return
        }

        const item = result as MediaItem

        // Prioritize items with Draw Things metadata
        if (await item.hasMetadata()) {
            addImageItem(item)
            return
        }

        // Fallback to the first available item if no metadata is found
        if (!firstItem) {
            firstItem = item
        }
    }

    if (firstItem) {
        addImageItem(firstItem)
    }
}

async function* loadItems(
    pasteboard: "general" | "drag",
): AsyncGenerator<MediaItem | (MediaItem | undefined)[] | undefined> {
    const types = await getClipboardTypes(pasteboard)
    const text = await getClipboardText(
        clipboardTextTypes.filter((t) => types.includes(t)),
        pasteboard,
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

            // Special handling for bulk file loading
            if (uti === "NSFilenamesPboardType" && result.urls) {
                const items = await settledValues(
                    result.urls.map((f) => createMediaItem(f, { ...utiSource, file: f })),
                )
                yield items
                return
            }

            // Handle binary data from clipboard
            if (result.data) {
                const item = await createMediaItem(result.data.buffer, utiSource, result.data.type)
                if (item) yield item
            }

            // Handle URLs (web or local)
            if (result.urls) {
                for (const url of result.urls) {
                    const item = await createMediaItem(url, { ...utiSource, url })
                    if (item) yield item
                }
            }

            // Handle DTP internal references
            if (result.dtpImage) {
                const item = await ImageItem.fromDtpImage(
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

/**
 * Factory helper to create either an ImageItem or VideoItem based on type.
 */
async function createMediaItem(
    input: string | Uint8Array,
    source: MediaItemSource,
    typeHint?: string,
): Promise<MediaItem | undefined> {
    const processedInput = preprocess(input)
    const mediaType = typeHint ?? determineType(processedInput)
    if (!mediaType) return undefined
    console.log("createMedia", mediaType)
    if (isVideo(mediaType)) {
        if (typeof processedInput === "string")
            return await VideoItem.fromUrl(processedInput, source)
        // Videos are not loaded from binary data — only from paths/URLs
        console.warn(
            "Ignoring video binary data from clipboard; videos must be loaded from path/URL",
        )
        return undefined
    } else {
        if (typeof processedInput === "string")
            return await ImageItem.fromUrl(processedInput, source)
        return await ImageItem.fromBuffer(processedInput, mediaType, source)
    }
}

function preprocess(input: string | Uint8Array) {
    try {
        if (
            typeof input === "string" &&
            (input.startsWith("https://cdn.discordapp.com") ||
                input.startsWith("https://media.discordapp.net"))
        ) {
            const url = new URL(input)
            url.searchParams.delete("format")
            url.searchParams.delete("quality")
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

function isPose(type: string, text: string) {
    if (type !== "public.utf8-plain-text") return false

    try {
        const pose = JSON.parse(text)
        return isOpenPose(pose)
    } catch {}

    return false
}
