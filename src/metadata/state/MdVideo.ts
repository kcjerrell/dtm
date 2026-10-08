import { convertFileSrc } from "@tauri-apps/api/core"
import { getVideoMetadata } from "@/commands"
import type { DrawThingsMetaData } from "@/types"
import { determineType } from "@/utils/mediaTypes"
import { getDrawThingsDataFromVideo } from "../helpers"
import type { MediaItemSource } from "@/state/mediaStore/types"
import { isLocalUrl } from "./imageLoaders"
import type { ExifType } from "./imageMetadata"
import MdItem, { type MdItemConstructorOpts } from "./MdItem"

export interface MdVideoConstructorOpts extends MdItemConstructorOpts {
    url: string
    filePath?: string | undefined
}

export class MdVideo extends MdItem {
    private _metadata?: ExifType | null
    private _dtData?: DrawThingsMetaData | null
    private _metadataStatus?: "pending" | "done" | "failed"
    private _metadataPromise: PromiseWithResolvers<void> = Promise.withResolvers<void>()
    private _url?: string
    private _filePath?: string

    constructor(opts: MdVideoConstructorOpts) {
        super(opts)

        this._url = opts.url
        this._filePath = opts.filePath
    }

    get metadata() {
        if (!this._metadata && !this._metadataStatus) this.loadMetadata()
        if (this._metadataStatus === "failed") this.loadMetadata()
        return this._metadata
    }

    get metadataStatus() {
        return this._metadataStatus
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

    async loadMetadata(force = false) {
        if (this.$isBinding) return
        if (!force && this._metadataStatus) return
        if (!this._filePath) return
        if (force) {
            this._metadataStatus = undefined
            this._metadataPromise = Promise.withResolvers<void>()
        }
        this._metadataStatus = "pending"

        try {
            this._metadata = (await getVideoMetadata(this._filePath)) as ExifType
            this._dtData = getDrawThingsDataFromVideo(this._metadata) ?? null
            this._metadataStatus = "done"
        } catch (e) {
            this._metadataStatus = "failed"
            console.warn("couldn't load metadata from", this._filePath, e)
        } finally {
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

    static async fromJSON(json: Partial<ReturnType<MdVideo["toJSON"]>>) {
        if (!json.url || !json.filePath) throw new Error("Invalid video item json")
        const item = new MdVideo(json as MdVideoConstructorOpts)
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

            return new MdVideo({
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
            return await MdVideo.fromFile(filePath, { ...source, url: undefined, file: url })
        }

        const mediaType = determineType(url)
        if (!mediaType) return undefined

        return new MdVideo({
            type: mediaType,
            source: { ...source, url },
            url: url,
        })
    }
}
