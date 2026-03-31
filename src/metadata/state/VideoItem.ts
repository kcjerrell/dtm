import MediaItem, { type MediaItemSource, type MediaItemConstructorOpts } from "./mediaItem"
import { determineType } from "@/utils/mediaTypes"
import { isLocalUrl } from "./ImageItem"
import { convertFileSrc } from '@tauri-apps/api/core'

export interface VideoItemConstructorOpts extends MediaItemConstructorOpts {
    url?: string
    filePath?: string
}

let idCounter = 0

export class VideoItem extends MediaItem {
    private _url?: string
    private _filePath?: string

    constructor(opts: VideoItemConstructorOpts) {
        super(opts)
        this._url = opts.url
        this._filePath = opts.filePath
    }

    get exif() {
        return null
    }

    get dtData() {
        return null
    }

    get thumbUrl() {
        // TODO: generate a real thumbnail frame via ffmpeg
        return this._url
    }

    get url() {
        return this._url
    }

    get filePath() {
        return this._filePath
    }

    async hasMetadata(): Promise<boolean> {
        return false
    }

    toJSON() {
        return {
            ...super.toJSON(),
            url: this._url,
            filePath: this._filePath,
        }
    }

    static fromFile(file: string, source: MediaItemSource) {
        try {
            // Normalize file:// URLs to actual paths for convertFileSrc
            let filePath = file
            if (filePath.startsWith("file://")) {
                filePath = decodeURIComponent(new URL(filePath).pathname)
            }

            const mediaType = determineType(filePath)
            if (!mediaType) return undefined

            const id = `vid_${idCounter++}`
            const url = convertFileSrc(filePath)

            return new VideoItem({
                id,
                type: mediaType,
                source,
                url,
                filePath,
            })
        } catch (e) {
            console.warn("couldn't create video item from file", e)
            return undefined
        }
    }

    static fromUrl(url: string, source: MediaItemSource) {
        if (isLocalUrl(url)) {
            const filePath = url.startsWith("files://") ? url.replace("files://", "file://") : url
            return VideoItem.fromFile(filePath, source)
        }

        // Remote URL — reference directly, no downloading
        const mediaType = determineType(url)
        if (!mediaType) return undefined

        const id = `vid_${idCounter++}`
        return new VideoItem({
            id,
            type: mediaType,
            source: { ...source, url },
            url,
        })
    }
}
