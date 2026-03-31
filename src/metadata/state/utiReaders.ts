import plist from "plist"
import { extractImgSrc, extractPaths } from "./imageLoaders"
import { determineType } from '@/utils/mediaTypes'

type UtiReader<T extends string | Uint8Array = string | Uint8Array> = (
    data: T,
) => ReadResult | undefined

type ReadResult = {
    uti: keyof typeof readers
    data?: { buffer: Uint8Array; type: string }
    urls?: string[]
    dtpImage?: { projectId: number; imageId: number }
}

const readers = {
    NSFilenamesPboardType: (data: string) => {
        const urls = plist.parse(data) as string[]
        return { uti: "NSFilenamesPboardType", urls }
    },
    "public.utf8-plain-text": (data: string) => textTypeReader("public.utf8-plain-text", data),
    "public.html": (data: string) => {
        const src = extractImgSrc(data)
        if (!src) return undefined
        return { uti: "public.html", urls: [src] }
    },
    "org.chromium.source-url": (data: string) => textTypeReader("org.chromium.source-url", data),
    "public.png": (data: Uint8Array) => binaryTypeReader("public.png", data),
    "public.tiff": (data: Uint8Array) => binaryTypeReader("public.tiff", data),
    "public.jpeg": (data: Uint8Array) => binaryTypeReader("public.jpeg", data),
    "public.webp": (data: Uint8Array) => binaryTypeReader("public.webp", data),
    "public.file-url": (data: string) => textTypeReader("public.file-url", data),
    "public.url": (data: string) => textTypeReader("public.url", data),
} as Record<string, UtiReader>

function textTypeReader(uti: string, data: string): ReadResult | undefined {
    const paths = extractPaths(data)
    if (paths.urls?.length === 0 && !paths.dtpImage) return undefined
    return {
        uti,
        urls: paths.urls,
        dtpImage: paths.dtpImage
    }
}

function binaryTypeReader(uti: string, data: Uint8Array) {
    if (!data || data.length === 0) return undefined
    return { uti, data: { buffer: data, type: determineType(data)} }
}

export function tryRead(uti: string, data: string | Uint8Array) {
    const reader = readers[uti]
    if (!reader) return
    try {
        return reader(data)
    } catch (e) {
        console.warn("couldn't read uti", uti, e)
        return
    }
}
