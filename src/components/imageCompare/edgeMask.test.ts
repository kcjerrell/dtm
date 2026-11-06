import { describe, expect, it } from "vitest"
import { applyEdgeMask } from "./edgeMask"

function pixels(width: number, height: number, sample: (x: number, y: number) => number[]) {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) data.set(sample(x, y), (y * width + x) * 4)
    }
    return { width, height, data }
}

describe("binary alignment edge mask", () => {
    it.each([
        [1, 1],
        [1, 5],
        [5, 1],
        [5, 5],
    ])("leaves a uniform %sx%s image fully transparent, including borders", (width, height) => {
        const image = pixels(width, height, () => [150, 100, 50, 255])
        applyEdgeMask(image)
        expect(image.data.every((value) => value === 0)).toBe(true)
    })

    it.each(["horizontal", "vertical"])(
        "keeps both sides of a %s edge with strictly binary RGBA",
        (axis) => {
            const image = pixels(5, 5, (x, y) => {
                const shade = (axis === "horizontal" ? y : x) < 2 ? 0 : 255
                return [shade, shade, shade, 255]
            })
            applyEdgeMask(image)
            for (let y = 0; y < 5; y++) {
                for (let x = 0; x < 5; x++) {
                    const coordinate = axis === "horizontal" ? y : x
                    const expected = coordinate === 1 || coordinate === 2 ? 255 : 0
                    expect([...image.data.slice((y * 5 + x) * 4, (y * 5 + x + 1) * 4)]).toEqual([
                        expected,
                        expected,
                        expected,
                        expected,
                    ])
                }
            }
        },
    )

    it("ignores hidden RGB in fully transparent input", () => {
        const image = pixels(5, 5, (x) => (x < 2 ? [0, 0, 0, 0] : [255, 255, 255, 0]))
        applyEdgeMask(image)
        expect(image.data.every((value) => value === 0)).toBe(true)
    })

    it("does not place edges outside the source's coverage", () => {
        const image = pixels(5, 5, (x) => [255, 255, 255, x < 2 ? 0 : 255])
        applyEdgeMask(image)
        expect([...image.data.slice((2 * 5 + 1) * 4, (2 * 5 + 2) * 4)]).toEqual([0, 0, 0, 0])
        expect([...image.data.slice((2 * 5 + 2) * 4, (2 * 5 + 3) * 4)]).toEqual([
            255, 255, 255, 255,
        ])
    })

    it("suppresses low-contrast noise instead of producing faint gray pixels", () => {
        const image = pixels(5, 5, (x) => (x < 2 ? [100, 100, 100, 255] : [104, 104, 104, 255]))
        applyEdgeMask(image)
        expect(image.data.every((value) => value === 0)).toBe(true)
    })
})
