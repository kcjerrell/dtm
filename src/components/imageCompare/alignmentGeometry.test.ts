import { describe, expect, it } from "vitest"
import {
    type AlignmentCorner,
    getAlignmentScreenGeometry,
    resizeAlignment,
} from "./alignmentGeometry"

describe("alignment manipulation geometry", () => {
    it("projects B and converts A pixels through shared pan and zoom", () => {
        const result = getAlignmentScreenGeometry(
            {
                imageAWidth: 512,
                imageAHeight: 512,
                imageBWidth: 2048,
                imageBHeight: 2048,
                imageBOffset: { x: 8, y: -16 },
                imageBScale: 0.5,
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
