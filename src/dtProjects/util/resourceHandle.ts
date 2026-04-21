import { type ClipExtra, DtpService, type ImageExtra, type TensorHistoryExtra } from "@/commands"
import { drawPose, pointsToPose, tensorToPoints } from "@/utils/pose"
import type { SubItem } from "../types"

export class ResourceHandle {
    image?: ImageExtra
    subItem?: SubItem

    constructor(item: ImageExtra | SubItem) {
        if (isImageExtra(item)) this.image = item
        else this.subItem = item as SubItem
    }

    get projectId() {
        const projectId = this.image?.project_id ?? this.subItem?.projectId
        if (!projectId) throw new Error("No project id")
        return projectId
    }

    get clipId() {
        return this.image?.clip_id
    }

    get isVideo() {
        return this.clipId && this.clipId > 0
    }

    get isPose() {
        return this.subItem?.type === "pose"
    }

    get nodeId() {
        return this.image?.node_id ?? null
    }

    private tensorId?: string | null
    async getTensorId() {
        if (!this.tensorId) {
            if (this.subItem?.tensorId) this.tensorId = this.subItem.tensorId
            else {
                const tHistory = await this.getHistory()
                this.tensorId = tHistory?.tensor_id ?? null
            }
        }
        return this.tensorId
    }

    private history?: TensorHistoryExtra | null
    /** Will be null if the resource doesn't come from a tensor history node */
    async getHistory() {
        if (this.history === undefined) {
            if (this.image) {
                this.history = await DtpService.getHistoryFull(this.projectId, this.image.node_id)
            } else {
                this.history = null
            }
        }
        return this.history
    }

    private clip?: ClipExtra | null
    async getClip() {
        if (this.clip === undefined) {
            if (this.clipId) {
                this.clip = await DtpService.getClip(this.image.id, this.clipId)
                console.log("getclip", this)
            } else this.clip = null
        }
        return this.clip
    }

    async getPngData(frame?: number) {
        console.log("getpngdata for frame", frame, this.image?.prompt?.slice(0, 80))
        if (this.isPose) {
            return await this.getPoseImage()
        }
        let tensorId: Nullable<string>
        if (frame !== undefined) {
            const clip = await this.getClip()
            tensorId = clip?.frames.find((f) => f.indexInAClip === frame)?.tensorId
            console.log(clip?.frames)
        } else {
            tensorId = await this.getTensorId()
        }
        if (!tensorId) throw new Error("No tensor id")

        const data = await DtpService.decodeTensor(this.projectId, tensorId, true, this.nodeId)
        return data
    }

    async getPoseData() {
        if (!this.isPose || !this.subItem?.tensorId) throw new Error("Not a pose")
        let pose = this.subItem.pose
        if (!pose) {
            const data = await DtpService.decodeTensor(this.projectId, this.subItem.tensorId, false)
            const points = tensorToPoints(data)
            pose = pointsToPose(points, this.subItem.width ?? 1024, this.subItem.height ?? 1024)
        }
        return pose
    }

    async getPoseImage() {
        const pose = await this.getPoseData()
        return await drawPose(pose, 4)
    }

    static from(item: ImageExtra | SubItem | null | undefined) {
        if (!item) return undefined
        return new ResourceHandle(item)
    }
}

function isImageExtra(item?: unknown): item is ImageExtra {
    if (!item || typeof item !== "object") return false

    if ("id" in item && "node_id" in item && "project_id" in item) return true

    return false
}
