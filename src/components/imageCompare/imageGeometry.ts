import type { CSSProperties } from "react"

interface ImageGeometryInput {
    imageAWidth: number
    imageAHeight: number
    imageBWidth: number
    imageBHeight: number
    imageBOffset?: { x: number; y: number }
    imageBScale?: number
}

/** A fixed, symmetric surface; B's adjustment never changes the surface or its origin. */
export function getComparisonGeometry(input: ImageGeometryInput) {
    const {
        imageAWidth,
        imageAHeight,
        imageBWidth,
        imageBHeight,
        imageBOffset = { x: 0, y: 0 },
        imageBScale = 1,
    } = input
    if (
        !Number.isFinite(imageBScale) ||
        imageBScale <= 0 ||
        !Number.isFinite(imageBOffset.x) ||
        !Number.isFinite(imageBOffset.y)
    ) {
        throw new Error("Image B alignment requires a positive finite scale and finite offsets")
    }

    const width = Math.max(imageAWidth, imageBWidth)
    const height = Math.max(imageAHeight, imageBHeight)
    const fitA =
        imageAWidth > 0 && imageAHeight > 0
            ? Math.min(width / imageAWidth, height / imageAHeight)
            : 0
    const fitB =
        imageBWidth > 0 && imageBHeight > 0
            ? Math.min(width / imageBWidth, height / imageBHeight)
            : 0
    const aWidth = imageAWidth * fitA
    const aHeight = imageAHeight * fitA
    const bWidth = imageBWidth * fitB * imageBScale
    const bHeight = imageBHeight * fitB * imageBScale

    return {
        width,
        height,
        a: { x: (width - aWidth) / 2, y: (height - aHeight) / 2, width: aWidth, height: aHeight },
        b: {
            x: (width - bWidth) / 2 + imageBOffset.x * fitA,
            y: (height - bHeight) / 2 + imageBOffset.y * fitA,
            width: bWidth,
            height: bHeight,
        },
    }
}

/** Percentage placement uses exactly the same geometry at any viewport size or shared zoom. */
export function getComparisonImageStyle(
    input: ImageGeometryInput,
    image: "a" | "b",
): CSSProperties {
    const geometry = getComparisonGeometry(input)
    const rect = geometry[image]
    const percent = (value: number, total: number) => `${total > 0 ? (value / total) * 100 : 0}%`
    return {
        position: "absolute",
        left: percent(rect.x, geometry.width),
        top: percent(rect.y, geometry.height),
        width: percent(rect.width, geometry.width),
        height: percent(rect.height, geometry.height),
        maxWidth: "none",
        maxHeight: "none",
    }
}
