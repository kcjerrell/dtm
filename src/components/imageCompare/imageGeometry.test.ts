import { describe, expect, it } from "vitest"
import { getComparisonGeometry, getComparisonImageStyle } from "./imageGeometry"

describe("comparison geometry", () => {
    it("fits a small original to its upscale's resolution in either slot", () => {
        for (const [imageAWidth, imageBWidth] of [
            [512, 2048],
            [2048, 512],
        ]) {
            const geometry = getComparisonGeometry({
                imageAWidth,
                imageAHeight: imageAWidth,
                imageBWidth,
                imageBHeight: imageBWidth,
            })
            expect([geometry.width, geometry.height]).toEqual([2048, 2048])
            expect(geometry.a).toEqual({ x: 0, y: 0, width: 2048, height: 2048 })
            expect(geometry.b).toEqual(geometry.a)
        }
    })

    it("centers opposite aspect ratios symmetrically", () => {
        const geometry = getComparisonGeometry({
            imageAWidth: 768,
            imageAHeight: 1024,
            imageBWidth: 1024,
            imageBHeight: 768,
        })
        expect([geometry.width, geometry.height]).toEqual([1024, 1024])
        expect(geometry.a).toEqual({ x: 128, y: 0, width: 768, height: 1024 })
        expect(geometry.b).toEqual({ x: 0, y: 128, width: 1024, height: 768 })
    })

    it("scales B around its center and translates in A pixels without expanding the surface", () => {
        const input = {
            imageAWidth: 512,
            imageAHeight: 512,
            imageBWidth: 2048,
            imageBHeight: 2048,
            imageBScale: 1.5,
            imageBOffset: { x: -8, y: 16 },
        }
        const geometry = getComparisonGeometry(input)
        expect([geometry.width, geometry.height]).toEqual([2048, 2048])
        expect(geometry.b).toEqual({ x: -544, y: -448, width: 3072, height: 3072 })
        expect(getComparisonImageStyle(input, "b")).toMatchObject({
            left: "-26.5625%",
            top: "-21.875%",
            width: "150%",
            height: "150%",
        })
    })
})
