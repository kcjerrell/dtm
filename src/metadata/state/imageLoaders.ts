import * as pathlib from "@tauri-apps/api/path"
import plist from "plist"
import { postMessage } from "@/context/Messages"
import {
    fetchImage,
    getClipboardBinary,
    getClipboardText,
    getClipboardTypes,
    getLocalImage,
} from "@/utils/clipboard"
import { settledValues } from "@/utils/helpers"
import { drawPose } from "@/utils/pose"
import { isOpenPose } from "@/utils/poseHelpers"
import type { ImageItem } from "./ImageItem"
import { createImageItem } from "./store"

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
export async function loadImage2(pasteboard: "general" | "drag") {
    const types = await getClipboardTypes(pasteboard)
    const text = await getClipboardText(
        clipboardTextTypes.filter((t) => types.includes(t)),
        pasteboard,
    )
    const source = pasteboard === "general" ? "clipboard" : "drop"

    const getType = async (type: string) => {
        if (!types.includes(type)) return null

        if (type in text) return text[type]
        return await getClipboardBinary(type, pasteboard)
    }

    const checked: string[] = []
    const skipTypes: string[] = []

    for (const type of prioritizedTypes) {
        if (!types.includes(type)) continue
        if (skipTypes.includes(type)) continue

        const data = await getType(type)
        if (!data) continue

        if (isPose(type, data as string)) {
            return createImageFromPose(data as string)
        }

        if (typeof data === "string") {
            const images = await tryLoadText(data, type, source, checked)
            if (images.length > 1) return true
            if (images.length === 1 && images[0].dtData) return true
            if (type === "NSFilenamesPboardType") {
                skipTypes.push("public.tiff")
            }
            // if one image, but image doesn't have dtdata, keep looking
        } else if (data instanceof Uint8Array) {
            const image = await createImageItem(data, getImageType(type), {
                source,
                image: type,
                pasteboardType: type,
            })
            if (image) return true
        }
    }

    return null
}

async function tryLoadText(
    text: string,
    type: string,
    source: "clipboard" | "drop",
    excludeMut: string[] = [],
): Promise<ImageItem[]> {
    const { files, urls } = parseText(text, type)
    const items = [] as Parameters<typeof createImageItem>[]

    for (const file of files) {
        // if (textItem) break
        if (excludeMut.includes(file)) continue
        excludeMut.push(file)
        console.debug("Creating image item from file", file)
        const image = await getLocalImage(file)
        if (image) {
            const item: Parameters<typeof createImageItem> = [
                image,
                await pathlib.extname(file),
                {
                    source,
                    file,
                    pasteboardType: type,
                },
            ]
            items.push(item)
        }
    }

    for (const url of urls) {
        if (items.length) break
        if (excludeMut.includes(url)) continue
        excludeMut.push(url)
        const msg = postMessage({
            channel: "toolbar",
            message: "Downloading image...",
            uType: "image",
            duration: 1000,
        })
        let image = null
        try {
            image = await fetchImage(url)
        } catch {}
        msg.remove()
        if (image) {
            const item: Parameters<typeof createImageItem> = [
                image,
                (await pathlib.extname(new URL(url).pathname)) ?? "png",
                {
                    source,
                    url,
                    pasteboardType: type,
                },
            ]
            items.push(item)
            // createImageItem(...textItem)
        }
    }

    if (!items.length) return []

    return settledValues(items.map((item) => createImageItem(...item)))
}

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
            // paths = imgSrc ? [imgSrc] : []
            break
        }
        case "public.file-url":
        case "public.url":
        case "org.chromium.source-url":
        case "public.utf8-plain-text":
            text = value
            // paths = value
            // 	.split("\n")
            // 	.map((f) => f.trim())
            // 	.filter((f) => f.length > 0)
            break
    }

    // const files = [] as string[]
    // const urls = [] as string[]

    // for (const p of paths) {
    // 	const url = getUrl(p)
    // 	if (url) {
    // 		urls.push(url)
    // 		continue
    // 	}
    // 	const localPath = getLocalPath(p)
    // 	if (localPath) files.push(localPath)
    // }

    return extractPaths(text)
}

export const clipboardTextTypes = [
    "NSFilenamesPboardType",
    "public.html",
    "public.utf8-plain-text",
    "org.chromium.source-url",
    "public.file-url",
    "public.url",
]

function getImageType(imageType: string) {
    let type = imageType

    if (type.startsWith("image/")) {
        type = type.split("/")[1]
    }
    if (type.startsWith("public.")) {
        type = type.split(".")[1]
    }

    if (type === "jpeg") type = "jpg"

    return type
}

/**
 * When copying or dragging an image from chromium, public.html will have a single
 * <img> element. This will return the value of the src attribute
 * @param htmlString html containing a single img element
 * @returns img.src
 */

function extractImgSrc(htmlString: string): string | null {
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

function extractPaths(text: string): { files: string[]; urls: string[] } {
    const files: string[] = []
    const urls: string[] = []

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
            files.push(candidate)
        }
        // ❌ anything else gets ignored (random words, etc.)
        match = chunkRegex.exec(text)
    }

    return { files, urls }
}

function isPose(type: string, text: string) {
    if (type !== "public.utf8-plain-text") return false

    try {
        const pose = JSON.parse(text)
        return isOpenPose(pose)
    } catch {}

    return false
}

async function createImageFromPose(text: string) {
    const image = await drawPose(JSON.parse(text))
    if (image) await createImageItem(image, "png", { source: "clipboard" })
}
