import { Mutex } from "async-mutex"
import { DtpService, getVideoMetadata } from "@/commands"
import type { DrawThingsMetaData, ImageSource } from "@/types"
import { fetchImage } from "@/utils/clipboard"
import ImageStore, { type ImageStoreEntry, isVideo } from "@/utils/imageStore"
import { getDrawThingsDataFromExif } from "../helpers"
import MediaItem, { type MediaItemConstructorOpts } from "./mediaItem"
import { type ExifType, getExif } from "./metadataStore"

export interface ImageItemConstructorOpts extends MediaItemConstructorOpts {
    exif?: ExifType | null
    dtData?: DrawThingsMetaData | null
    entry?: ImageStoreEntry
}

export class ImageItem extends MediaItem {
    private _exif?: ExifType | null
    private _dtData?: DrawThingsMetaData | null
    private _exifStatus?: "pending" | "done"
    private _entry?: ImageStoreEntry
    private _entryStatus?: "pending" | "done" | "error"
    private _mutex = new Mutex()

    constructor(opts: ImageItemConstructorOpts) {
        super(opts)

        if (opts.exif) {
            this._exif = opts.exif
            this._dtData = opts.dtData
            this._exifStatus = "done"
        }

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
        // run with mutex in case multiple components try to load exif at the same time
        this._mutex.runExclusive(async () => {
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
            }
        })
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
            const entry = await ImageStore.get(this.id)
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
        return !!this.dtData
    }

    static async fromBuffer(
        buffer: Uint8Array | null | undefined,
        type: string,
        source: ImageSource,
    ) {
        if (!buffer) return undefined
        try {
            // save to image store
            const entry = await ImageStore.save(buffer, type)
            if (!entry) return
            const item = new ImageItem({
                id: entry.id,
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
