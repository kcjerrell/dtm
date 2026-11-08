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
        "thins a %s edge to one pixel with strictly binary RGBA",
        (axis) => {
            const image = pixels(5, 5, (x, y) => {
                const shade = (axis === "horizontal" ? y : x) < 2 ? 0 : 255
                return [shade, shade, shade, 255]
            })
            applyEdgeMask(image)
            for (let y = 0; y < 5; y++) {
                for (let x = 0; x < 5; x++) {
                    const coordinate = axis === "horizontal" ? y : x
                    const expected = coordinate === 1 ? 255 : 0
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

    it.each(["horizontal", "vertical"])(
        "keeps the same %s contour for reversed contrast",
        (axis) => {
            const image = pixels(5, 5, (x, y) => {
                const shade = (axis === "horizontal" ? y : x) < 2 ? 255 : 0
                return [shade, shade, shade, 255]
            })
            applyEdgeMask(image)
            for (let y = 0; y < 5; y++) {
                for (let x = 0; x < 5; x++) {
                    expect(image.data[(y * 5 + x) * 4 + 3]).toBe(
                        (axis === "horizontal" ? y : x) === 1 ? 255 : 0,
                    )
                }
            }
        },
    )

    it.each([2, 4])("recovers a softened %sx edge without widening its contour", (upscale) => {
        const ramp =
            upscale === 2
                ? [0, 0, 4, 12, 24, 36, 44, 48, 48]
                : [0, 0, 2, 6, 12, 20, 30, 40, 52, 64, 74, 82, 88, 92, 94, 94]
        const source = () => pixels(ramp.length, 5, (x) => [ramp[x], ramp[x], ramp[x], 255])
        const uncompensated = source()
        applyEdgeMask(uncompensated)
        expect(uncompensated.data.every((value) => value === 0)).toBe(true)

        const compensated = source()
        applyEdgeMask(compensated, upscale)
        const peak = upscale === 2 ? 4 : 8
        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < ramp.length; x++) {
                expect(compensated.data[(y * ramp.length + x) * 4 + 3]).toBe(x === peak ? 255 : 0)
            }
        }
    })

    it.each([2, 4])(
        "rejects disconnected weak texture at %sx while retaining a strong contour",
        (upscale) => {
            const image = pixels(40, 30, (x, y) => {
                const base = x < 8 ? 40 : 200
                const noise = x >= 25 && x < 32 && y >= 10 && y < 20 ? 12 : 0
                return [base + noise, base + noise, base + noise, 255]
            })
            applyEdgeMask(image, upscale)
            for (let y = 0; y < 30; y++) {
                expect(image.data[(y * 40 + 7) * 4 + 3]).toBe(255)
                for (let x = 20; x < 40; x++) {
                    expect(image.data[(y * 40 + x) * 4 + 3]).toBe(0)
                }
            }
        },
    )

    it.each([false, true])(
        "tracks faint continuations in both directions (strong at bottom: %s)",
        (strongAtBottom) => {
            const source = (connected: boolean) =>
                pixels(17, 101, (x, y) => {
                    const strength = connected
                        ? 16 + 144 * (strongAtBottom ? y / 100 : 1 - y / 100)
                        : 16
                    const shade = x < 8 ? 40 : 40 + strength
                    return [shade, shade, shade, 255]
                })
            const isolated = source(false)
            applyEdgeMask(isolated, 2)
            expect(isolated.data.every((value) => value === 0)).toBe(true)

            const connected = source(true)
            applyEdgeMask(connected, 2)
            for (const y of [1, 99]) {
                const edges = []
                for (let x = 0; x < 17; x++) {
                    if (connected.data[(y * 17 + x) * 4 + 3] === 255) edges.push(x)
                }
                expect(edges).toHaveLength(1)
                expect([7, 8]).toContain(edges[0])
            }
        },
    )

    it("thins a broad strong transition without leaving a band", () => {
        const ramp = [0, 0, 16, 64, 128, 192, 240, 255, 255]
        const image = pixels(ramp.length, 5, (x) => [ramp[x], ramp[x], ramp[x], 255])
        applyEdgeMask(image)
        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < ramp.length; x++) {
                expect(image.data[(y * ramp.length + x) * 4 + 3]).toBe(x === 4 ? 255 : 0)
            }
        }
    })

    it.each([
        [1, 7, "horizontal"],
        [7, 1, "vertical"],
        [7, 7, "horizontal"],
        [7, 7, "vertical"],
    ] as const)(
        "retains an edge next to the final border of a %sx%s image",
        (width, height, axis) => {
            const length = axis === "horizontal" ? height : width
            const image = pixels(width, height, (x, y) => {
                const shade = (axis === "horizontal" ? y : x) === length - 1 ? 255 : 0
                return [shade, shade, shade, 255]
            })
            applyEdgeMask(image)
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    expect(image.data[(y * width + x) * 4 + 3]).toBe(
                        (axis === "horizontal" ? y : x) === length - 2 ? 255 : 0,
                    )
                }
            }
        },
    )

    it.each([false, true])(
        "retains diagonal contours through contrast inversion (rising: %s)",
        (rising) => {
            const source = (inverse: boolean) =>
                pixels(9, 9, (x, y) => {
                    const bright = rising ? x > y : x + y > 8
                    const shade = bright !== inverse ? 255 : 0
                    return [shade, shade, shade, 255]
                })
            const image = source(false)
            const inverted = source(true)
            applyEdgeMask(image)
            applyEdgeMask(inverted)
            expect(image.data).toEqual(inverted.data)
            expect(image.data.some((value) => value === 255)).toBe(true)
            expect(image.data.some((value) => value === 0)).toBe(true)
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
