import type { DrawThingsMetaData } from "@/types"
import type { ExifType } from "./state/metadataStore"

export function hasDrawThingsData(
    exif?: unknown,
    skipParse = false,
): exif is { exif: { UserComment: { value: string } } } {
    try {
        if (
            exif &&
            typeof exif === "object" &&
            "exif" in exif &&
            exif.exif &&
            typeof exif.exif === "object" &&
            "UserComment" in exif.exif &&
            exif.exif.UserComment &&
            typeof exif.exif.UserComment === "object" &&
            "value" in exif.exif.UserComment &&
            typeof exif.exif.UserComment.value === "string"
        ) {
            if (!skipParse) JSON.parse(exif.exif.UserComment.value)

            return true
        }
    } catch (_) {
        return false
    }
    return false
}

export function getDrawThingsDataFromExif(exif?: ExifType | null): DrawThingsMetaData | undefined {
    const hasExif = hasDrawThingsData(exif, true)
    if (hasExif) {
        try {
            const value = exif.exif.UserComment.value
            const data = JSON.parse(value)

            data.prompt = data.c
            delete data.c
            data.negativePrompt = data.uc
            delete data.uc
            data.config = data.v2
            delete data.v2

            return data
        } catch (_) {
            return undefined
        }
    }

    return undefined
}

export function getDrawThingsDataFromVideo(metadata: unknown) {
    if (metadata && typeof metadata === "object" && "format" in metadata) {
        const format = metadata.format as Record<string, unknown>
        if (format && typeof format === "object" && "tags" in format) {
            const tags = format.tags as Record<string, unknown>
            if (tags && typeof tags === "object" && "comment" in tags) {
                try {
                    const rawComment = tags.comment
                    const data =
                        typeof rawComment === "string"
                            ? (JSON.parse(rawComment) as Record<string, unknown>)
                            : rawComment && typeof rawComment === "object"
                              ? ({ ...rawComment } as Record<string, unknown>)
                              : undefined
                    if (!data) return undefined

                    data.prompt = data.c
                    delete data.c
                    data.negativePrompt = data.uc
                    delete data.uc
                    data.config = data.v2
                    delete data.v2

                    return data as DrawThingsMetaData
                } catch (_) {
                    return undefined
                }
            }
        }
    }

    return undefined
}
