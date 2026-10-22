import { getVideoMetadata } from "@/commands"

import type { DrawThingsMetaData } from "@/types"
import { getDrawThingsDataFromVideo } from "../helpers"
import type { ExifType } from "./imageMetadata"
import MdItem from "./MdItem"

export class MdVideo extends MdItem {
    private _metadata?: ExifType | null
    private _dtData?: DrawThingsMetaData | null
    private _metadataStatus?: "pending" | "done" | "failed"
    private _metadataPromise: PromiseWithResolvers<void> = Promise.withResolvers<void>()

    get metadata() {
        if (!this._metadataStatus || this._metadataStatus === "failed") void this.loadMetadata()
        return this._metadata
    }

    get metadataStatus() {
        return this._metadataStatus
    }

    get dtData() {
        if (!this._metadataStatus) void this.loadMetadata()
        return this._dtData
    }

    async loadMetadata(force = false) {
        if (!force && this._metadataStatus && this._metadataStatus !== "failed") return
        const filePath = this.storage.kind === "file" ? this.storage.path : undefined
        if (!filePath) {
            this._metadataStatus = "done"
            this._metadataPromise.resolve()
            return
        }
        if (force || this._metadataStatus === "failed") {
            this._metadataPromise = Promise.withResolvers<void>()
        }
        this._metadataStatus = "pending"

        try {
            this._metadata = (await getVideoMetadata(filePath)) as ExifType
            this._dtData = getDrawThingsDataFromVideo(this._metadata) ?? null
            this._metadataStatus = "done"
        } catch (e) {
            this._metadataStatus = "failed"
            console.warn("couldn't load metadata from", filePath, e)
        } finally {
            this._metadataPromise.resolve()
        }
    }

    async hasMetadata(): Promise<boolean> {
        await this.loadMetadata()
        await this._metadataPromise.promise
        return !!this._dtData
    }
}
