import { getMimeTypeFromExtension } from "@/utils/mediaTypes"

const THUMBNAIL_SIZE = 180

export async function createImageThumbnail(data: Uint8Array<ArrayBuffer>, type: string) {
    const url = URL.createObjectURL(new Blob([data], { type: getMimeTypeFromExtension(type) }))
    try {
        const image = new Image()
        image.src = url
        await image.decode()

        const { naturalWidth: width, naturalHeight: height } = image
        const size = Math.min(width, height)
        const x = (width - size) / 2
        // Bias portrait crops upward while keeping the largest possible square.
        const y = (height - size) / 4

        const canvas = document.createElement("canvas")
        canvas.width = THUMBNAIL_SIZE
        canvas.height = THUMBNAIL_SIZE
        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("Could not create a thumbnail canvas")
        ctx.imageSmoothingQuality = "high"
        ctx.drawImage(image, x, y, size, size, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE)
        const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
        if (!png) throw new Error("Could not encode the image thumbnail")
        return new Uint8Array(await png.arrayBuffer())
    } finally {
        URL.revokeObjectURL(url)
    }
}
