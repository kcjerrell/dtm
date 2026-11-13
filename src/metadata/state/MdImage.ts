import type { DrawThingsMetaData } from "@/types"
import { getDrawThingsDataFromExif } from "../helpers"
import { type ExifType, getExif } from "./imageMetadata"
import MdItem from "./MdItem"

export class MdImage extends MdItem {
    private _metadata?: ExifType | null
    private _dtData?: DrawThingsMetaData | null
    private _metadataStatus?: "pending" | "done"
    private _metadataPromise: PromiseWithResolvers<void> = Promise.withResolvers<void>()

    get metadata() {
        if (!this._metadata && !this._metadataStatus) this.loadMetadata()

        return this._metadata
    }

    get dtData() {
        if (!this._dtData && !this._metadataStatus && !this.metadata) this.loadMetadata()

        return this._dtData
    }

    async loadMetadata() {
        if (this._metadataStatus) return
        this._metadataStatus = "pending"

        if (!this.url) {
            this._metadataStatus = "done"
            this._metadataPromise.resolve()
            return
        }

        try {
            const metadata = await getExif(this.url)
            this._metadata = metadata
            this._dtData = getDrawThingsDataFromExif(metadata) ?? null
        } catch (e) {
            console.warn("couldn't load metadata from ", this.url, e)
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
}
