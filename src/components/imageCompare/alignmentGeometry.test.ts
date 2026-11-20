import { describe, expect, it } from "vitest"
import {
    type AlignmentCorner,
    alignAroundPin,
    getAlignmentScreenGeometry,
    resizeAlignment,
} from "./alignmentGeometry"
import { getComparisonGeometry } from "./imageGeometry"

describe("alignment manipulation geometry", () => {
    it("projects B and converts A pixels through shared pan and zoom", () => {
        const result = getAlignmentScreenGeometry(
            {
                imageAWidth: 512,
                imageAHeight: 512,
                imageBWidth: 2048,
                imageBHeight: 2048,
                imageBOffset: { x: 8, y: -16 },
                imageBScaleX: 0.5,
                imageBScaleY: 0.5,
                contentSize: { width: 400, height: 400 },
                contentOffset: { left: 100, top: 50 },
            },
            { x: 20, y: -10, scale: 2 },
        )
        expect(result.pixelsPerA).toBe(1.5625)
        expect(result.rect).toEqual({ x: 132.5, y: 15, width: 400, height: 400 })
    })

    it.each<[AlignmentCorner, number, number, number, number]>([
        ["nw", -100, -50, 0, 50],
        ["ne", 100, -50, 100, 50],
        ["sw", -100, 50, 0, 100],
        ["se", 100, 50, 100, 100],
    ])("scales from %s without moving the opposite corner", (corner, dx, dy, x, y) => {
        const next = resizeAlignment(
            { x: 100, y: 100, width: 200, height: 100 },
            corner,
            { x: dx, y: dy },
            { width: 500, height: 400 },
        )
        expect(next).toEqual({ x, y, width: 300, height: 150 })
    })

    it("stops at the first viewport edge even when the pointer travels beyond it", () => {
        const next = resizeAlignment(
            { x: 100, y: 100, width: 200, height: 100 },
            "nw",
            { x: -1000, y: -1000 },
            { width: 500, height: 400 },
        )
        expect(next).toEqual({ x: 0, y: 50, width: 300, height: 150 })
    })

    it("keeps a positive usable size instead of flipping when crossing the anchor", () => {
        const next = resizeAlignment(
            { x: 100, y: 100, width: 200, height: 100 },
            "se",
            { x: -1000, y: -1000 },
            { width: 500, height: 400 },
        )
        expect(next).toEqual({ x: 100, y: 100, width: 48, height: 24 })
    })

    it("allows a visible handle to resize when the opposite anchor is outside the viewport", () => {
        const next = resizeAlignment(
            { x: -100, y: -50, width: 400, height: 200 },
            "se",
            { x: 1000, y: 1000 },
            { width: 500, height: 400 },
        )
        expect(next).toEqual({ x: -100, y: -50, width: 600, height: 300 })
    })
})

describe("pinned alignment", () => {
    const input = {
        imageAWidth: 600,
        imageAHeight: 900,
        imageBWidth: 2400,
        imageBHeight: 1200,
        imageBScaleX: 1.25,
        imageBScaleY: -0.75,
        imageBOffset: { x: 25, y: -15 },
    }
    const pin = { ax: 120, ay: 400, bx: 300, by: 850 }
    const dragged = { bx: 1800, by: 100 }
    it.each([
        { ax: 500, ay: 200 },
        { ax: -200, ay: 800 },
        { ax: 120, ay: 400 },
    ])("keeps both correspondences exact at %o, including flips and zero", (pointer) => {
        const next = alignAroundPin(input, pin, dragged, pointer)
        const geometry = getComparisonGeometry({ ...input, ...next })
        const fitA = geometry.a.width / input.imageAWidth
        for (const point of [pin, { ...dragged, ...pointer }]) {
            expect(geometry.b.x + (point.bx / input.imageBWidth) * geometry.b.width).toBeCloseTo(
                geometry.a.x + point.ax * fitA,
                10,
            )
            expect(geometry.b.y + (point.by / input.imageBHeight) * geometry.b.height).toBeCloseTo(
                geometry.a.y + point.ay * fitA,
                10,
            )
        }
        if (pointer.ax < pin.ax) expect(next.imageBScaleX).toBeLessThan(0)
        if (pointer.ay > pin.ay) expect(next.imageBScaleY).toBeLessThan(0)
    })

    it("recovers after crossing zero within the same gesture", () => {
        const collapsed = alignAroundPin(input, pin, dragged, { ax: pin.ax, ay: pin.ay })
        const next = alignAroundPin({ ...input, ...collapsed }, pin, dragged, { ax: -200, ay: 800 })
        expect(next).toEqual(alignAroundPin(input, pin, dragged, { ax: -200, ay: 800 }))
    })

    it("preserves an axis with no leverage instead of dividing by zero", () => {
        const next = alignAroundPin(input, pin, { bx: pin.bx, by: 100 }, { ax: 500, ay: 200 })
        expect(next.imageBScaleX).toBe(input.imageBScaleX)
        expect(Object.values(next.imageBOffset).every(Number.isFinite)).toBe(true)
        const geometry = getComparisonGeometry({ ...input, ...next })
        expect(geometry.b.x + (pin.bx / input.imageBWidth) * geometry.b.width).toBeCloseTo(
            geometry.a.x + (pin.ax * geometry.a.width) / input.imageAWidth,
        )
    })

    it("projects signed B coordinates and its visual bounds through pan and zoom", () => {
        const result = getAlignmentScreenGeometry(
            {
                ...input,
                contentSize: { width: 800, height: 400 },
                contentOffset: { left: 20, top: 50 },
            },
            { x: 40, y: -20, scale: 2 },
        )
        expect(result.b.height).toBeLessThan(0)
        expect(result.rect.height).toBe(-result.b.height)
        expect(result.rect.y).toBeCloseTo(result.b.y + result.b.height)
        const projectedX = result.a.x + pin.ax * result.pixelsPerA
        const projectedY = result.a.y + pin.ay * result.pixelsPerA
        const pointB = {
            bx: ((projectedX - result.b.x) / result.b.width) * input.imageBWidth,
            by: ((projectedY - result.b.y) / result.b.height) * input.imageBHeight,
        }
        const next = alignAroundPin(input, { ...pin, ...pointB }, dragged, { ax: 500, ay: 200 })
        const updated = getAlignmentScreenGeometry(
            {
                ...input,
                ...next,
                contentSize: { width: 800, height: 400 },
                contentOffset: { left: 20, top: 50 },
            },
            { x: 40, y: -20, scale: 2 },
        )
        expect(updated.b.x + (pointB.bx / input.imageBWidth) * updated.b.width).toBeCloseTo(
            projectedX,
        )
        expect(updated.b.y + (pointB.by / input.imageBHeight) * updated.b.height).toBeCloseTo(
            projectedY,
        )
    })
})
