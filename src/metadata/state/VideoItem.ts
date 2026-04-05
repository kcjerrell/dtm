import { convertFileSrc } from "@tauri-apps/api/core"
import { getVideoMetadata } from "@/commands"
import type { DrawThingsMetaData } from "@/types"
import { determineType } from "@/utils/mediaTypes"
import { getDrawThingsDataFromVideo } from "../helpers"
import { isLocalUrl } from "./ImageItem"
import MediaItem, { type MediaItemConstructorOpts, type MediaItemSource } from "./MediaItem"
import type { ExifType } from "./metadataStore"

export interface VideoItemConstructorOpts extends MediaItemConstructorOpts {
    url: string
    filePath?: string | undefined
}

export class VideoItem extends MediaItem {
    private _metadata?: ExifType | null
    private _dtData?: DrawThingsMetaData | null
    private _metadataStatus?: "pending" | "done"
    private _metadataPromise: PromiseWithResolvers<void> = Promise.withResolvers<void>()
    private _url?: string
    private _filePath?: string

    constructor(opts: VideoItemConstructorOpts) {
        super(opts)

        this._url = opts.url
        this._filePath = opts.filePath
    }

    get metadata() {
        if (!this._metadata && !this._metadataStatus) this.loadMetadata()
        return this._metadata
    }

    get dtData() {
        if (!this._metadata && !this._metadataStatus) this.loadMetadata()
        return this._dtData
    }

    get thumbUrl() {
        return this._url
    }

    get url() {
        return this._url
    }

    async loadMetadata() {
        if (this._metadataStatus || !this._filePath) return
        this._metadataStatus = "pending"

        try {
            this._metadata = (await getVideoMetadata(this._filePath)) as ExifType
            this._dtData = getDrawThingsDataFromVideo(this._metadata) ?? null
        } catch (e) {
            console.warn("couldn't load metadata from", this._filePath, e)
        } finally {
            this._metadataStatus = "done"
            this._metadataPromise.resolve()
        }
    }

    async hasMetadata(): Promise<boolean> {
        await this.loadMetadata()
        await this._metadataPromise.promise.catch(() => {})
        return !!this.dtData
    }

    toJSON() {
        return {
            ...super.toJSON(),
            url: this._url,
            filePath: this._filePath,
        }
    }

    static async fromJSON(json: Partial<ReturnType<VideoItem["toJSON"]>>) {
        if (!json.url || !json.filePath) throw new Error("Invalid video item json")
        const item = new VideoItem(json as VideoItemConstructorOpts)
        return item
    }

    static async fromFile(file: string, source: MediaItemSource) {
        try {
            // Normalize file:// URLs to actual paths
            let filePath = file
            if (filePath.startsWith("file://")) {
                filePath = decodeURIComponent(new URL(filePath).pathname)
            }

            const mediaType = determineType(filePath)
            if (!mediaType) return undefined

            return new VideoItem({
                type: mediaType,
                source,
                url: convertFileSrc(filePath),
                filePath,
            })
        } catch (e) {
            console.warn("couldn't create video item from file", e)
            return undefined
        }
    }

    static async fromUrl(url: string, source: MediaItemSource) {
        if (isLocalUrl(url)) {
            const filePath = url.startsWith("files://") ? url.replace("files://", "file://") : url
            return await VideoItem.fromFile(filePath, source)
        }

        const mediaType = determineType(url)
        if (!mediaType) return undefined

        return new VideoItem({
            type: mediaType,
            source: { ...source, url },
            url: url,
        })
    }
}
