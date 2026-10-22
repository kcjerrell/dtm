import type { CSSProperties } from "react"

interface ImageGeometryInput {
    imageAWidth: number
    imageAHeight: number
    imageBWidth: number
    imageBHeight: number
    imageBOffset?: { x: number; y: number }
    imageBScaleX?: number
    imageBScaleY?: number
}

/** A fixed, symmetric surface; B's adjustment never changes the surface or its origin. */
export function getComparisonGeometry(input: ImageGeometryInput) {
    const {
        imageAWidth,
        imageAHeight,
        imageBWidth,
        imageBHeight,
        imageBOffset = { x: 0, y: 0 },
        imageBScaleX = 1,
        imageBScaleY = 1,
    } = input
    if (
        !Number.isFinite(imageBScaleX) ||
        !Number.isFinite(imageBScaleY) ||
        !Number.isFinite(imageBOffset.x) ||
        !Number.isFinite(imageBOffset.y)
    ) {
        throw new Error("Image B alignment requires finite scales and offsets")
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
    const bWidth = imageBWidth * fitB * imageBScaleX
    const bHeight = imageBHeight * fitB * imageBScaleY

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
        left: percent(Math.min(rect.x, rect.x + rect.width), geometry.width),
        top: percent(Math.min(rect.y, rect.y + rect.height), geometry.height),
        width: percent(Math.abs(rect.width), geometry.width),
        height: percent(Math.abs(rect.height), geometry.height),
        transform: `scale(${rect.width < 0 ? -1 : 1}, ${rect.height < 0 ? -1 : 1})`,
        maxWidth: "none",
        maxHeight: "none",
    }
}
