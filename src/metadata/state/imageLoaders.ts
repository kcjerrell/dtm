import * as pathlib from "@tauri-apps/api/path"
import plist from "plist"
import { postMessage } from "@/state/Messages"
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
import { ImageItem, loadDtpImage } from "./ImageItem"
import type MediaItem from "./mediaItem"
import { addImageItem, createImageItem } from "./metadataStore"

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
    let bestItem: MediaItem | null = null
    for await (const item of loadItems(pasteboard)) {
        // the NSFilenamesPboardType will return an array with all filenames
        // this is the only time multiple images should be loaded at the same time
        if (Array.isArray(item)) {
            item.forEach((it) => {
                addImageItem(it)
            })
            return
        }
        if (!bestItem) {
            bestItem = item
            continue
        }
        if ((await item.hasMetadata()) && !(await bestItem.hasMetadata())) {
            bestItem = item
        }
    }
    if (bestItem) {
        addImageItem(bestItem)
    }
}

async function* loadItems(pasteboard: "general" | "drag") {
    console.log("loadItems")
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

    console.log(types.filter((t) => prioritizedTypes.includes(t)))

    for (const type of prioritizedTypes) {
        if (!types.includes(type)) continue
        if (skipTypes.includes(type)) continue

        const data = await getType(type)
        if (!data) continue

        if (isPose(type, data as string)) {
            const item = await ImageItem.fromBuffer(
                await drawPose(JSON.parse(data as string)),
                "png",
                {
                    source,
                    image: "png",
                },
            )
            if (item) yield item
        }

        if (typeof data === "string") {
            if (type === "NSFilenamesPboardType") {
                const items = []
                for await (const result of tryLoadText2(data, type, checked)) {
                    const item = await ImageItem.fromBuffer(result.image, result.type, {
                        source,
                        image: type,
                        pasteboardType: type,
                    })
                    if (item) items.push(item)
                }
                yield items
            }
            for await (const result of tryLoadText2(data, type, checked)) {
                const item = await ImageItem.fromBuffer(result.image, result.type, {
                    source,
                    image: type,
                    pasteboardType: type,
                })
                if (item) yield item
            }
            if (type === "NSFilenamesPboardType") skipTypes.push("public.tiff")
        } else if (data instanceof Uint8Array) {
            const item = await ImageItem.fromBuffer(data, getImageType(type), {
                source,
                image: type,
                pasteboardType: type,
            })
            if (item) yield item
        }
    }
}

async function* tryLoadText2(text: string, type: string, checked: string[]) {
    const { files, urls, dtpImage } = parseText(text, type)

    if (dtpImage) {
        try {
            const dtpResult = await loadDtpImage(dtpImage)
            if (dtpResult) yield { image: dtpResult.image, source: dtpResult, type: "png" }
        } catch (e) {
            console.warn("couldn't create image item from dtp image", e)
        }
    }

    for (const file of files) {
        if (checked.includes(file)) continue
        checked.push(file)
        try {
            const image = await getLocalImage(file)
            if (image)
                yield {
                    image,
                    source: { file, pasteboardType: type },
                    type: getImageType(await pathlib.extname(file)),
                }
        } catch (e) {
            console.warn("couldn't create image item from file", e)
        }
    }

    for (const url of urls) {
        if (checked.includes(url)) continue
        checked.push(url)
        try {
            // TODO this needs to get the mime type
            const result = await fetchImage(url)
            if (result)
                yield {
                    image: result.data,
                    source: { url, pasteboardType: type },
                    type: getImageType(result.type),
                }
        } catch (e) {
            console.warn("couldn't create image item from url", e)
        }
    }
}

/**
 * takes a text clipboard entry of the given type, attempts to resolve the image
 * and return the image buffer
 * @param excludeMut a list of paths that should be ignored. This list will be mutated, adding additional invalid paths/urls as they are discovered
 */
async function tryLoadText(
    text: string,
    type: string,
    source: "clipboard" | "drop",
    excludeMut: string[] = [],
): Promise<ImageItem[]> {
    const { files, urls, dtpImage } = parseText(text, type)

    if (dtpImage) {
        const item = await ImageItem.fromDtpImage(dtpImage.projectId, dtpImage.imageId)
        if (item) return [item]
    }

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

    return await settledValues(items.map((item) => createImageItem(...item)))
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

function extractPaths(text: string): {
    files: string[]
    urls: string[]
    dtpImage?: { projectId: number; imageId: number }
} {
    const files: string[] = []
    const urls: string[] = []

    const dtpImageRegex = /^dtm:\/\/dtproject\/thumb(?:half)?\/(\d+)\/(\d+)/gm
    const dtpMatch = dtpImageRegex.exec(text)
    if (dtpMatch) {
        const dtpImage = { projectId: Number(dtpMatch[1]), imageId: Number(dtpMatch[2]) }
        return { files, urls, dtpImage }
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
