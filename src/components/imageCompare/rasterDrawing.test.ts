// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest"
import { compareBrightness, compareColor, compareDifference } from "./compareImages"
import { drawRaster, type RasterJob } from "./rasterDrawing"

vi.mock("./compareImages", () => ({
    compareBrightness: vi.fn(),
    compareColor: vi.fn(),
    compareDifference: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

describe("raster effect dispatch", () => {
    it.each([
        ["brightness", compareBrightness],
        ["color", compareColor],
        ["difference", compareDifference],
    ] as const)("draws the supported %s effect", (effect, compare) => {
        const imageA = document.createElement("img")
        const imageB = document.createElement("img")
        const canvas = document.createElement("canvas")
        const options = { gain: 2, threshold: 0.01 }

        drawRaster({ kind: "slider", effect, imageA, imageB, options }, canvas)

        expect(compare).toHaveBeenCalledExactlyOnceWith(imageA, imageB, canvas, options)
        for (const other of [compareBrightness, compareColor, compareDifference]) {
            if (other !== compare) expect(other).not.toHaveBeenCalled()
        }
    })

    it.each([
        "toString",
        "valueOf",
        "constructor",
        "hasOwnProperty",
        "__defineSetter__",
        "__proto__",
        "unknown",
        "",
    ])("rejects the untrusted effect name %j", (effect) => {
        // Model a worker message whose effect does not match the TypeScript union.
        const job = {
            kind: "slider",
            effect,
            imageA: document.createElement("img"),
            imageB: document.createElement("img"),
            options: {},
        } as RasterJob<HTMLImageElement>

        expect(() => drawRaster(job, document.createElement("canvas"))).toThrow(
            "Unsupported comparison effect",
        )
        expect(compareBrightness).not.toHaveBeenCalled()
        expect(compareColor).not.toHaveBeenCalled()
        expect(compareDifference).not.toHaveBeenCalled()
    })
})
