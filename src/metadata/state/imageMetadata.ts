import { readFile } from "@tauri-apps/plugin-fs"
import * as exifr from "exifr"

export type ExifType = Record<string, Record<string, unknown>>

export async function getExif(arg: ArrayBuffer | Uint8Array | string): Promise<ExifType | null> {
    const data = typeof arg === "string" ? await readFile(arg) : arg

    try {
        return await exifr.parse(data, {
            xmp: { multiSegment: true, parse: true },
            makerNote: true,
            userComment: true,
            icc: true,
            iptc: true,
            mergeOutput: false,
        })
    } catch (e) {
        console.warn(e)
        return null
    }
}
