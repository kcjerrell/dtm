import { Mutex } from "async-mutex"
import { DtpService, getVideoMetadata } from "@/commands"
import type { DrawThingsMetaData, ImageSource } from "@/types"
import { fetchImage, getLocalImage } from "@/utils/clipboard"
import ImageStore, { type ImageStoreEntry, isVideo } from "@/utils/imageStore"
import { getDrawThingsDataFromExif } from "../helpers"
import MediaItem, { MediaItemSource, type MediaItemConstructorOpts } from "./mediaItem"
import { type ExifType, getExif } from "./metadataStore"
import { determineType } from "@/utils/mediaTypes"

export interface ImageItemConstructorOpts extends MediaItemConstructorOpts {
    exif?: ExifType | null
    dtData?: DrawThingsMetaData | null
    entry?: ImageStoreEntry
    entryId: string
}

export class ImageItem extends MediaItem {
    private _exif?: ExifType | null
    private _dtData?: DrawThingsMetaData | null
    private _exifStatus?: "pending" | "done"
    private _exifPromise: PromiseWithResolvers<void> = Promise.withResolvers<void>()
    private _entry?: ImageStoreEntry
    private _entryId: string
    private _entryStatus?: "pending" | "done" | "error"

    constructor(opts: ImageItemConstructorOpts) {
        super(opts)

        if (opts.exif) {
            this._exif = opts.exif
            this._dtData = opts.dtData
            this._exifStatus = "done"
        }

        this._entryId = opts.entryId
        if (opts.entry) {
            this._entry = opts.entry
            this._entryStatus = "done"
        }
    }

    get isVideo() {
        return isVideo(this.type)
    }

    get exif() {
        if (!this._exif && !this._exifStatus) this.loadExif()

        return this._exif
    }

    get dtData() {
        if (!this._dtData && !this._exifStatus && !this.exif) this.loadExif()

        return this._dtData
    }

    async loadExif() {
        if (this._exifStatus) return
        this._exifStatus = "pending"

        if (!this._entry) await this.loadEntry()
        if (!this._entry?.url) return

        try {
            const exif = this.isVideo
                ? await getVideoMetadata(this._entry.cachePath)
                : await getExif(this._entry.url)
            this._exif = exif as ExifType
            this._dtData = getDrawThingsDataFromExif(exif as ExifType) ?? null
        } catch (e) {
            console.warn("couldn't load exif from ", this._entry.url, e)
        } finally {
            this._exifStatus = "done"
            this._exifPromise?.resolve()
        }
    }

    get thumbUrl() {
        if (!this._entry?.thumbUrl && !this._entryStatus) this.loadEntry()
        return this._entry?.thumbUrl
    }

    get url() {
        if (!this._entry?.url && !this._entryStatus) this.loadEntry()
        return this._entry?.url
    }

    async loadEntry() {
        if (this._entryStatus) return
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

    async hasMetadata(): Promise<boolean> {
        await this.loadExif()
        await this._exifPromise.promise.catch(() => {})
        return !!this.dtData
    }

    override toJSON() {
        return {
            ...super.toJSON(),
            entryId: this._entry?.id,
        }
    }

    static async fromBuffer(
        buffer: Uint8Array | null | undefined,
        type: string,
        source: MediaItemSource,
    ) {
        console.debug("ImageItem.fromBuffer", type, source, buffer)
        if (!buffer) return undefined
        try {
            // save to image store
            const entry = await ImageStore.save(buffer, type)
            if (!entry) return
            const item = new ImageItem({
                entryId: entry.id,
                type,
                source,
                entry,
            })
            return item
        } catch (e) {
            console.warn("couldn't create image item from buffer", e)
            return undefined
        }
    }

    static async fromFile(file: string, source: MediaItemSource) {
        try {
            const data = await getLocalImage(file)
            if (!data) return
            const mediaType = determineType(file) ?? determineType(data)
            if (!mediaType) return
            const item = await ImageItem.fromBuffer(data, mediaType, { ...source, file })
            return item
        } catch (e) {
            console.warn("couldn't create image item from file", e)
            return undefined
        }
    }

    /**
     *
     * @param url can be a web url or local file path
     * @param source
     */
    static async fromUrl(url: string, source: MediaItemSource) {
        if (isLocalUrl(url)) {
            const filePath = url.startsWith("files://") ? url.replace("files://", "file://") : url
            return ImageItem.fromFile(filePath, source)
        }

        const fetched = await fetchImage(url)
        if (!fetched) return undefined
        const type = determineType(fetched.type)
        if (!type) return undefined
        return ImageItem.fromBuffer(fetched.data, type, {
            ...source,
            url,
        })
    }

    static async fromDtpImage(projectId: number, imageId: number) {
        try {
            const dtpResult = await loadDtpImage({ projectId, imageId })
            if (dtpResult) {
                return ImageItem.fromBuffer(dtpResult.image, "png", {
                    source: "project",
                    projectFile: dtpResult.projectFile,
                    nodeId: dtpResult.history.row_id,
                    tensorId: dtpResult.history.tensor_id,
                })
            }
        } catch (e) {
            console.warn("couldn't create image item from dtp image", e)
            return undefined
        }
    }
}

export async function loadDtpImage(dtpImage: { projectId: number; imageId: number }) {
    const imageItem = await DtpService.findImageFromPreviewId(dtpImage.projectId, dtpImage.imageId)
    if (!imageItem) return
    const history = await DtpService.getHistoryFull(imageItem.project_id, imageItem.node_id)
    if (!history || !history.tensor_id) return
    const image = await DtpService.decodeTensor(
        imageItem.project_id,
        history.tensor_id,
        true,
        imageItem.node_id,
    )
    return { image, projectFile: history.project_path, history }
}

export function isLocalUrl(url: string): boolean {
    // Treat absolute paths as local
    if (url.startsWith("/")) {
        return true
    }

    // Handle file:// and files:// protocols
    if (url.startsWith("file://") || url.startsWith("files://")) {
        return true
    }

    try {
        const parsed = new URL(url)
        // Remote URLs are those with http or https protocol
        return parsed.protocol !== "http:" && parsed.protocol !== "https:"
    } catch {
        // If it's not a valid URL, treat it as a potential local path
        return true
    }
}
