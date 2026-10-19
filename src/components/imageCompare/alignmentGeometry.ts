import { getComparisonGeometry } from "./imageGeometry"

export type AlignmentCorner = "nw" | "ne" | "sw" | "se"
export interface AlignmentRect {
    x: number
    y: number
    width: number
    height: number
}

type ScreenGeometryInput = Parameters<typeof getComparisonGeometry>[0] & {
    contentSize: { width: number; height: number }
    contentOffset: { left: number; top: number }
}

/** Project B into viewport pixels so outlines and handles do not scale with shared zoom. */
export function getAlignmentScreenGeometry(
    input: ScreenGeometryInput,
    zoom: { x: number; y: number; scale: number },
) {
    const geometry = getComparisonGeometry(input)
    const factor = geometry.width > 0 ? (input.contentSize.width / geometry.width) * zoom.scale : 0
    const left =
        input.contentOffset.left + zoom.x + (input.contentSize.width * (1 - zoom.scale)) / 2
    const top = input.contentOffset.top + zoom.y + (input.contentSize.height * (1 - zoom.scale)) / 2
    return {
        rect: {
            x: left + geometry.b.x * factor,
            y: top + geometry.b.y * factor,
            width: geometry.b.width * factor,
            height: geometry.b.height * factor,
        },
        pixelsPerA: input.imageAWidth > 0 ? (geometry.a.width / input.imageAWidth) * factor : 0,
    }
}

/** Uniform corner scaling with the opposite corner fixed and the moving corner in the viewport. */
export function resizeAlignment(
    rect: AlignmentRect,
    corner: AlignmentCorner,
    delta: { x: number; y: number },
    viewport: { width: number; height: number },
): AlignmentRect {
    if (rect.width <= 0 || rect.height <= 0) return rect
    const sx = corner.endsWith("w") ? -1 : 1
    const sy = corner.startsWith("n") ? -1 : 1
    const anchorX = sx < 0 ? rect.x + rect.width : rect.x
    const anchorY = sy < 0 ? rect.y + rect.height : rect.y
    const xLimits = [-anchorX / (sx * rect.width), (viewport.width - anchorX) / (sx * rect.width)]
    const yLimits = [
        -anchorY / (sy * rect.height),
        (viewport.height - anchorY) / (sy * rect.height),
    ]
    // Keep the handles usable when shrinking, without enlarging an already tiny image.
    const minimum = Math.max(
        Math.min(1, 24 / Math.min(rect.width, rect.height)),
        Math.min(...xLimits),
        Math.min(...yLimits),
    )
    const maximum = Math.min(Math.max(...xLimits), Math.max(...yLimits))
    if (minimum > maximum) return rect
    const projected =
        1 +
        (sx * delta.x * rect.width + sy * delta.y * rect.height) /
            (rect.width * rect.width + rect.height * rect.height)
    const factor = Math.max(minimum, Math.min(maximum, projected))
    return {
        x: sx < 0 ? anchorX - rect.width * factor : anchorX,
        y: sy < 0 ? anchorY - rect.height * factor : anchorY,
        width: rect.width * factor,
        height: rect.height * factor,
    }
}
