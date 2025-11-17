import type { DrawThingsMetaData } from "@/types"
import type { ExifType } from './state/store'

export function hasDrawThingsData(
	exif?: unknown,
	skipParse = false,
): exif is { exif: {UserComment: { value: string } } }{
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
