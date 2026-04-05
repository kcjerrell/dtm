import { getVideoMetadata } from "@/commands"
import type { DrawThingsMetaData } from "@/types"
import { determineType } from "@/utils/mediaTypes"
import { getDrawThingsDataFromVideo } from "../helpers"
import { isLocalUrl } from "./ImageItem"
import MediaItem, { type MediaItemConstructorOpts, type MediaItemSource } from "./MediaItem"
import type { ExifType } from "./metadataStore"
import ImageStore, { type ImageStoreEntry } from "@/utils/imageStore"

export interface VideoItemConstructorOpts extends MediaItemConstructorOpts {
    entryId?: string
    entry?: ImageStoreEntry
    url?: string // legacy fallback
    filePath?: string // legacy fallback
    metadata?: ExifType | null
}

export class VideoItem extends MediaItem {
    private _entry?: ImageStoreEntry
    private _entryId?: string
    private _entryStatus?: "pending" | "done" | "error"
    private _legacyUrl?: string
    private _legacyFilePath?: string
    private _metadata?: ExifType | null
    private _dtData?: DrawThingsMetaData | null
    private _metadataStatus?: "pending" | "done"
    private _metadataPromise: PromiseWithResolvers<void> = Promise.withResolvers<void>()

    constructor(opts: VideoItemConstructorOpts) {
        super(opts)
        this._entryId = opts.entryId ?? opts.entry?.id
        this._legacyUrl = opts.url
        this._legacyFilePath = opts.filePath
        if (opts.entry) {
            this._entry = opts.entry
            this._entryStatus = "done"
        }

        if (opts.metadata) {
            this._metadata = opts.metadata
            this._metadataStatus = "done"
            this._dtData = getDrawThingsDataFromVideo(this._metadata) ?? null
        }
    }

    get entryId() {
        return this._entry?.id ?? this._entryId
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
        if (!this._entry?.thumbUrl && !this._entryStatus) this.loadEntry()
        return this._entry?.thumbUrl ?? this._legacyUrl
    }

    get url() {
        if (!this._entry?.url && !this._entryStatus) this.loadEntry()
        return this._entry?.url ?? this._legacyUrl
    }

    get filePath() {
        if (!this._entry && !this._entryStatus) this.loadEntry()
        return this._entry?.sourcePath ?? this._legacyFilePath
    }

    async loadEntry() {
        if (this._entryStatus || !this._entryId) return
        this._entryStatus = "pending"

        for (let i = 0; i < 3; i++) {
            const entry = await ImageStore.get(this._entryId)
            if (entry) {
                this._entry = entry
                this._entryStatus = "done"
                return
            }
            await new Promise((resolve) => setTimeout(resolve, 500))
        }

        this._entryStatus = "error"
    }

    private onFrame?: (video: HTMLVideoElement) => void
    setOnFrame(onFrame?: (video: HTMLVideoElement) => void) {
        this.onFrame = onFrame
    }

    raiseOnFrame(video: HTMLVideoElement) {
        this.onFrame?.(video)
    }

    async loadMetadata() {
        if (this._metadataStatus) return
        this._metadataStatus = "pending"

        try {
            if (!this._entry) await this.loadEntry()
            const path = this._entry?.sourcePath ?? this._legacyFilePath
            if (!path) return

            this._metadata = (await getVideoMetadata(path)) as ExifType
            this._dtData = getDrawThingsDataFromVideo(this._metadata) ?? null
        } catch (e) {
            console.warn("couldn't load metadata from", this.filePath, e)
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
            entryId: this.entryId,
            url: this._legacyUrl,
            filePath: this._legacyFilePath,
        }
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

            const entry = await ImageStore.save(filePath, mediaType)
            if (!entry) return undefined

            return new VideoItem({
                type: mediaType,
                source,
                entryId: entry.id,
                entry,
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

        const entry = await ImageStore.save(url, mediaType)
        if (!entry) return undefined

        return new VideoItem({
            type: mediaType,
            source: { ...source, url },
            entryId: entry.id,
            entry,
        })
    }
}
