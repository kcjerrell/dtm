import { DtpService } from "@/commands"
import DTProject from "@/commands/DTProject"
import type { DrawThingsMetaData } from "@/types"
import { fetchImage, getLocalImage } from "@/utils/clipboard"
import ImageStore, { isVideo } from "@/utils/imageStore"
import { determineType } from "@/utils/mediaTypes"
import { drawPose } from "@/utils/pose"
import { getDrawThingsDataFromExif } from "../helpers"
import MediaItem, { type MediaItemConstructorOpts, type MediaItemSource } from "./mediaItem"
import { type ExifType, getExif } from "./metadataStore"

export interface ImageItemConstructorOpts extends MediaItemConstructorOpts {
    imageBuffer?: Uint8Array
}

export class ImageItem extends MediaItem {
    private _metadata?: ExifType | null
    private _dtData?: DrawThingsMetaData | null
    private _metadataStatus?: "pending" | "done"
    private _metadataPromise: PromiseWithResolvers<void> = Promise.withResolvers<void>()
    private _url?: string
    private _thumbUrl?: string

    private constructor(opts: ImageItemConstructorOpts) {
        super(opts)
    }

    get isVideo() {
        return isVideo(this.type)
    }

    get metadata() {
        if (!this._metadata && !this._metadataStatus) this.loadMetadata()

        return this._metadata
    }

    get dtData() {
        if (!this._dtData && !this._metadataStatus && !this.metadata) this.loadMetadata()

        return this._dtData
    }

    async loadMetadata() {
        if (this.$isBinding) return
        if (this._metadataStatus) return
        this._metadataStatus = "pending"

        if (!this._url) {
            this._metadataStatus = "done"
            this._metadataPromise?.resolve()
            return
        }

        try {
            const metadata = await getExif(this._url)
            this._metadata = metadata as ExifType
            this._dtData = getDrawThingsDataFromExif(metadata as ExifType) ?? null
        } catch (e) {
            console.warn("couldn't load metadata from ", this._url, e)
        } finally {
            this._metadataStatus = "done"
            this._metadataPromise?.resolve()
        }
    }

    get thumbUrl() {
        return this._thumbUrl
    }

    get url() {
        return this._url
    }

    async hasMetadata(): Promise<boolean> {
        await this.loadMetadata()
        await this._metadataPromise.promise.catch(() => {})
        return !!this.dtData
    }

    private async loadEntry() {
        const entry = await ImageStore.get(this.id)
        this._url = entry?.url
        this._thumbUrl = entry?.thumbUrl
    }

    private async saveBufferEntry(buffer: Uint8Array) {
        try {
            const entry = await ImageStore.save(this.id, buffer, this.type)
            this._url = entry?.url
            this._thumbUrl = entry?.thumbUrl
        } catch (e) {
            console.warn("couldn't save image item entry", e)
        }
    }

    override toJSON() {
        return {
            ...super.toJSON(),
        }
    }

    static async fromJSON(json: ReturnType<ImageItem["toJSON"]>) {
        const item = new ImageItem(json)
        // retrieve url and thumbUrl from imagestore
        await item.loadEntry()
        return item
    }

    static async fromBuffer(
        buffer: Uint8Array | null | undefined,
        type: string,
        source: MediaItemSource,
    ) {
        console.debug("fromBuffer", buffer?.length, type, source)
        if (!buffer) return undefined
        try {
            const item = new ImageItem({
                type,
                source,
            })
            await item.saveBufferEntry(buffer)
            return item
        } catch (e) {
            console.warn("couldn't create image item from buffer", e)
            return undefined
        }
    }

    static async fromFile(file: string, source: MediaItemSource) {
        console.debug("fromFile", file, source)
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
        console.debug("fromUrl", url, source)
        if (isLocalUrl(url)) {
            const filePath = url.startsWith("files://") ? url.replace("files://", "file://") : url
            return ImageItem.fromFile(filePath, { ...source, url: null, file: filePath })
        }

        const fetched = await fetchImage(url)
        if (!fetched) return undefined
        const type = determineType(fetched.type)
        if (!type) return undefined
        return await ImageItem.fromBuffer(fetched.data, type, {
            ...source,
            url,
        })
    }

    static async fromDtpImage(projectId: number, imageId: number) {
        try {
            const dtpResult = await loadDtpImage({ projectId, imageId })
            if (dtpResult) {
                return await ImageItem.fromBuffer(dtpResult.image, "png", {
                    loadedFrom: "project",
                    projectFile: dtpResult.projectFile,
                    nodeId: dtpResult.history.rowid,
                    tensorId: dtpResult.history.tensorId,
                })
            }
        } catch (e) {
            console.warn("couldn't create image item from dtp image", e)
            return undefined
        }
    }

    static async fromPose(data: string, source: MediaItemSource) {
        const pose = JSON.parse(data)
        const buffer = await drawPose(pose)
        return ImageItem.fromBuffer(buffer, "png", { ...source, pose })
    }
}

export async function loadDtpImage(dtpImage: { projectId: number; imageId: number }) {
    const imageItem = await DtpService.findImageFromPreviewId(dtpImage.projectId, dtpImage.imageId)
    if (!imageItem) return
    const history = await DTProject.getTensorHistory(imageItem.project_id, imageItem.node_id)
    if (!history || !history.tensorId) return
    const image = await DtpService.decodeTensor(
        imageItem.project_id,
        history.tensorId,
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
