import { describe, expect, it } from "vitest"
import { getComparisonGeometry, getComparisonImageStyle } from "./imageGeometry"

describe("comparison geometry", () => {
    it("scales each axis independently around B's center", () => {
        const input = {
            imageAWidth: 512,
            imageAHeight: 512,
            imageBWidth: 2048,
            imageBHeight: 2048,
            imageBScaleX: 1.5,
            imageBScaleY: 1,
        }
        const geometry = getComparisonGeometry(input)
        expect(geometry.b).toEqual({ x: -512, y: 0, width: 3072, height: 2048 })
        expect(geometry.a).toEqual({ x: 0, y: 0, width: 2048, height: 2048 })
        expect([geometry.width, geometry.height]).toEqual([2048, 2048])
        expect(getComparisonImageStyle(input, "b")).toMatchObject({
            left: "-25%",
            top: "0%",
            width: "150%",
            height: "100%",
        })
    })

    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
        "rejects invalid axis scale %s",
        (scale) => {
            const input = {
                imageAWidth: 512,
                imageAHeight: 512,
                imageBWidth: 512,
                imageBHeight: 512,
            }
            expect(() => getComparisonGeometry({ ...input, imageBScaleX: scale })).toThrow()
            expect(() => getComparisonGeometry({ ...input, imageBScaleY: scale })).toThrow()
        },
    )

    it("keeps signed image coordinates but renders a positive box with reflections", () => {
        const input = {
            imageAWidth: 100,
            imageAHeight: 100,
            imageBWidth: 100,
            imageBHeight: 100,
            imageBScaleX: -2,
            imageBScaleY: -0.5,
            imageBOffset: { x: 10, y: -5 },
        }
        expect(getComparisonGeometry(input).b).toEqual({ x: 160, y: 70, width: -200, height: -50 })
        expect(getComparisonImageStyle(input, "b")).toMatchObject({
            left: "-40%",
            top: "20%",
            width: "200%",
            height: "50%",
            transform: "scale(-1, -1)",
        })
        expect(getComparisonGeometry({ ...input, imageBScaleX: 0 }).b.width).toBe(0)
        expect(getComparisonImageStyle({ ...input, imageBScaleX: 0 }, "b").width).toBe("0%")
    })

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
            imageBScaleX: 1.5,
            imageBScaleY: 1.5,
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
