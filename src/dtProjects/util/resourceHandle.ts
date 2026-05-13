import { type ClipExtra, DtpService, type ImageExtra } from "@/commands"
import DTProject from "@/commands/DTProject"
import type { TensorHistoryNode } from "@/commands/DTProjectTypes"
import { drawPose, pointsToPose, tensorToPoints } from "@/utils/pose"
import type { OpenPose } from "@/utils/poseHelpers"
import { getBounds, getLayer } from "../detailsOverlay/CanvasStackComponent"
import { type CanvasStack, isCanvasStack, type SubItem } from "../types"

/**
 * Used to represent an image for image commands
 */
export class ResourceHandle {
    image?: ImageExtra
    subItem?: MaybeReadonly<SubItem> | MaybeReadonly<CanvasStack>

    constructor(item: ImageExtra | MaybeReadonly<SubItem> | MaybeReadonly<CanvasStack>) {
        if (isImageExtra(item)) this.image = item
        else this.subItem = item
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
        return !isCanvasStack(this.subItem) && this.subItem?.type === "pose"
    }

    get isCanvasStack() {
        return isCanvasStack(this.subItem)
    }

    get nodeId() {
        return this.image?.node_id ?? null
    }

    private tensorId?: string | null
    async getTensorId() {
        if (!this.tensorId) {
            if (this.subItem && !isCanvasStack(this.subItem) && this.subItem.tensorId) {
                this.tensorId = this.subItem.tensorId
            } else {
                const tHistory = await this.getHistory()
                this.tensorId = tHistory?.tensorId ?? null
            }
        }
        return this.tensorId
    }

    private history?: TensorHistoryNode | null
    /** Will be null if the resource doesn't come from a tensor history node */
    async getHistory() {
        if (this.history === undefined) {
            if (this.image) {
                this.history = await DTProject.getTensorHistory(this.projectId, this.image.node_id)
            } else {
                this.history = null
            }
        }
        return this.history
    }

    private clip?: ClipExtra | null
    async getClip() {
        if (this.clip === undefined && this.clipId && this.image?.id) {
            this.clip = await DtpService.getClip(this.image.id, this.clipId)
        }
        return this.clip
    }

    async getPngData(frame?: number) {
        if (this.isPose) {
            return await this.getPoseImage()
        }
        if (this.isCanvasStack) {
            return await this.renderCanvas()
        }
        let tensorId: Nullable<string>
        if (frame !== undefined) {
            const clip = await this.getClip()
            tensorId = clip?.frames.find((f) => f.indexInAClip === frame)?.tensorId
        } else {
            tensorId = await this.getTensorId()
        }
        if (!tensorId) throw new Error("No tensor id")

        const data = await DtpService.decodeTensor(this.projectId, tensorId, true, this.nodeId)
        return data
    }

    async renderCanvas() {
        if (!isCanvasStack(this.subItem)) throw new Error("Not a canvas stack")
        const canvasStack = this.subItem as CanvasStack

        const layers = canvasStack.tensorData.map((td, index) =>
            getLayer(td, canvasStack.projectId, index),
        )

        const { minX, minY, width, height } = getBounds(layers)

        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("No canvas context")

        const images = layers.map(async (layer) => {
            const tensor = await DtpService.decodeTensor(
                this.projectId,
                `tensor_history_${layer.tensorData.tensor_id}`,
                true,
            )
            const blob = new Blob([tensor], { type: "image/png" })
            const imageBitmap = await createImageBitmap(blob)
            return { imageBitmap, layer }
        })
        const imageBitmaps = await Promise.all(images)
        for (const { imageBitmap, layer } of imageBitmaps) {
            ctx.drawImage(imageBitmap, layer.x - minX, layer.y - minY, layer.w, layer.h)
        }

        const blob = await new Promise((resolve: (blob: Blob | null) => void) =>
            canvas.toBlob(resolve, "image/png"),
        )
        if (!blob) throw new Error("No blob")
        const data = new Uint8Array(await blob.arrayBuffer())

        return data
    }

    async getPoseData() {
        if (
            !this.isPose ||
            !this.subItem ||
            isCanvasStack(this.subItem) ||
            !this.subItem.tensorId
        ) {
            throw new Error("Not a pose")
        }
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
        return await drawPose(pose as OpenPose, 4)
    }

    static from(
        item: ImageExtra | MaybeReadonly<SubItem> | MaybeReadonly<CanvasStack> | null | undefined,
    ) {
        if (!item) return undefined
        return new ResourceHandle(item)
    }
}

function isImageExtra(item?: unknown): item is ImageExtra {
    if (!item || typeof item !== "object") return false

    if ("id" in item && "node_id" in item && "project_id" in item) return true

    return false
}
