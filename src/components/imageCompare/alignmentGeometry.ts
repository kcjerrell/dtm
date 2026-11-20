import { getComparisonGeometry } from "./imageGeometry"

export type AlignmentCorner = "nw" | "ne" | "sw" | "se"
export type AlignmentHandle = AlignmentCorner | "n" | "e" | "s" | "w"
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
    const project = (rect: AlignmentRect) => ({
        x: left + rect.x * factor,
        y: top + rect.y * factor,
        width: rect.width * factor,
        height: rect.height * factor,
    })
    const b = project(geometry.b)
    return {
        a: project(geometry.a),
        b,
        rect: {
            x: Math.min(b.x, b.x + b.width),
            y: Math.min(b.y, b.y + b.height),
            width: Math.abs(b.width),
            height: Math.abs(b.height),
        },
        pixelsPerA: input.imageAWidth > 0 ? (geometry.a.width / input.imageAWidth) * factor : 0,
    }
}

/** Resize along an edge's axis or uniformly from a corner, keeping the opposite side fixed. */
export function resizeAlignment(
    rect: AlignmentRect,
    handle: AlignmentHandle,
    delta: { x: number; y: number },
    viewport: { width: number; height: number },
): AlignmentRect {
    if (rect.width <= 0 || rect.height <= 0) return rect
    const sx = handle.endsWith("w") ? -1 : handle.endsWith("e") ? 1 : 0
    const sy = handle.startsWith("n") ? -1 : handle.startsWith("s") ? 1 : 0
    const anchorX = sx < 0 ? rect.x + rect.width : rect.x
    const anchorY = sy < 0 ? rect.y + rect.height : rect.y
    const dx = sx * rect.width
    const dy = sy * rect.height
    const xLimits = dx ? [-anchorX / dx, (viewport.width - anchorX) / dx] : [-Infinity, Infinity]
    const yLimits = dy ? [-anchorY / dy, (viewport.height - anchorY) / dy] : [-Infinity, Infinity]
    const size = Math.min(sx ? rect.width : Infinity, sy ? rect.height : Infinity)
    // Keep the handles usable when shrinking, without enlarging an already tiny image.
    const minimum = Math.max(Math.min(1, 24 / size), Math.min(...xLimits), Math.min(...yLimits))
    const maximum = Math.min(Math.max(...xLimits), Math.max(...yLimits))
    if (minimum > maximum) return rect
    const projected = 1 + (delta.x * dx + delta.y * dy) / (dx * dx + dy * dy)
    const factor = Math.max(minimum, Math.min(maximum, projected))
    const width = sx ? rect.width * factor : rect.width
    const height = sy ? rect.height * factor : rect.height
    return {
        x: sx < 0 ? anchorX - width : anchorX,
        y: sy < 0 ? anchorY - height : anchorY,
        width,
        height,
    }
}

export interface AlignmentPin {
    ax: number
    bx: number
    ay: number
    by: number
}

/** Solve both axes from two point correspondences, including zero and reflected scales. */
export function alignAroundPin(
    input: Parameters<typeof getComparisonGeometry>[0],
    pin: AlignmentPin,
    dragged: { bx: number; by: number },
    pointer: { ax: number; ay: number },
) {
    const base = getComparisonGeometry({
        ...input,
        imageBOffset: { x: 0, y: 0 },
        imageBScaleX: 1,
        imageBScaleY: 1,
    })
    const fitA = base.a.width / input.imageAWidth
    const fitB = base.b.width / input.imageBWidth
    const axis = (
        anchorA: number,
        anchorB: number,
        draggedB: number,
        pointerA: number,
        sizeB: number,
        originA: number,
        surfaceSize: number,
        previousScale: number,
    ) => {
        // A point on the anchor's axis cannot determine that axis's scale.
        const scale =
            Math.abs(draggedB - anchorB) < 1e-6
                ? previousScale
                : ((pointerA - anchorA) * fitA) / ((draggedB - anchorB) * fitB)
        const offset =
            (originA + anchorA * fitA - surfaceSize / 2 - (anchorB - sizeB / 2) * fitB * scale) /
            fitA
        return { scale, offset }
    }
    const x = axis(
        pin.ax,
        pin.bx,
        dragged.bx,
        pointer.ax,
        input.imageBWidth,
        base.a.x,
        base.width,
        input.imageBScaleX ?? 1,
    )
    const y = axis(
        pin.ay,
        pin.by,
        dragged.by,
        pointer.ay,
        input.imageBHeight,
        base.a.y,
        base.height,
        input.imageBScaleY ?? 1,
    )
    return {
        imageBScaleX: x.scale,
        imageBScaleY: y.scale,
        imageBOffset: { x: x.offset, y: y.offset },
    }
}
