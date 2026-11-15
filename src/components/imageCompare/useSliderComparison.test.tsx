// @vitest-environment jsdom
import { Activity, act, createElement } from "react"
import { createRoot } from "react-dom/client"
import type { Snapshot } from "valtio"
import { afterEach, describe, expect, it, vi } from "vitest"
import { compareBrightness, compareColor, compareDifference } from "./compareImages"
import * as raster from "./raster"
import { ImageCompareContext, type ImageCompareState } from "./state"
import { useSliderComparison } from "./useSliderComparison"

vi.mock("./compareImages", () => ({
    compareBrightness: vi.fn(),
    compareColor: vi.fn(),
    compareDifference: vi.fn(),
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanups: (() => void)[] = []
afterEach(() => {
    for (const cleanup of cleanups.splice(0)) act(cleanup)
    vi.restoreAllMocks()
    vi.clearAllMocks()
})

function image(src: string, complete = true) {
    const element = document.createElement("img")
    element.src = src
    Object.defineProperties(element, {
        complete: { configurable: true, value: complete },
        naturalWidth: { value: 512 },
        naturalHeight: { value: 512 },
    })
    return element
}

function setup(loaded = true, withActivity = false) {
    const refs = {
        imgARef: { current: image("a.png", loaded) },
        imgBRef: { current: image("b.png", loaded) },
        offscreenCanvasRef: { current: null as raster.RasterSource | null },
    }
    const result = {} as {
        current: ReturnType<typeof useSliderComparison> & { state: ImageCompareState }
    }

    function Comparison({
        state,
        snap,
    }: {
        state: ImageCompareState
        snap: Snapshot<ImageCompareState>
    }) {
        const comparison = useSliderComparison(state, snap, refs)
        result.current = { state, ...comparison }
        return null
    }

    function Harness() {
        const [, state, snap] = ImageCompareContext.useCreate()
        const comparison = createElement(Comparison, { state, snap })
        return withActivity ? (
            <Activity mode={snap.mode === "slider" ? "visible" : "hidden"}>{comparison}</Activity>
        ) : (
            comparison
        )
    }
    const root = createRoot(document.createElement("div"))
    act(() => root.render(createElement(Harness)))
    cleanups.push(() => root.unmount())
    return { result, refs }
}

async function selectComparison(setupResult: ReturnType<typeof setup>) {
    await act(async () => {
        const { state } = setupResult.result.current
        state.imageASrc = "a.png"
        state.imageBSrc = "b.png"
        state.imageAWidth = state.imageAHeight = state.imageBWidth = state.imageBHeight = 512
        state.sliderTrail = "difference"
    })
}

describe("slider comparison regeneration", () => {
    it("regenerates independent axis changes and defers inactive changes", async () => {
        const context = setup()
        await selectComparison(context)
        const { state } = context.result.current
        await act(async () => {
            state.imageBScaleX = 1.2
        })
        await act(async () => {
            state.imageBScaleY = 0.8
        })
        expect(compareDifference).toHaveBeenCalledTimes(3)
        expect(compareDifference).toHaveBeenLastCalledWith(
            context.refs.imgARef.current,
            context.refs.imgBRef.current,
            context.refs.offscreenCanvasRef.current,
            expect.objectContaining({ imageBScaleX: 1.2, imageBScaleY: 0.8 }),
        )
        await act(async () => {
            state.mode = "align"
        })
        await act(async () => {
            state.imageBScaleX = 0.9
            state.imageBScaleY = 1.1
        })
        expect(compareDifference).toHaveBeenCalledTimes(3)
        await act(async () => {
            state.mode = "slider"
        })
        expect(compareDifference).toHaveBeenCalledTimes(4)
    })

    it("defers changes while inactive and reuses an unchanged buffer on return", async () => {
        const context = setup(true, true)
        await selectComparison(context)
        expect(compareDifference).toHaveBeenCalledTimes(1)
        const { state } = context.result.current
        await act(async () => {
            state.mode = "alt"
        })
        await act(async () => {
            state.imageBOffset = { x: 12, y: -3 }
            state.imageBScaleX = 1.2
            state.smoothing = false
            context.result.current.generate()
        })
        expect(compareDifference).toHaveBeenCalledTimes(1)
        await act(async () => {
            state.mode = "slider"
        })
        expect(compareDifference).toHaveBeenCalledTimes(2)
        expect(compareDifference).toHaveBeenLastCalledWith(
            context.refs.imgARef.current,
            context.refs.imgBRef.current,
            context.refs.offscreenCanvasRef.current,
            expect.objectContaining({
                imageBOffset: { x: 12, y: -3 },
                imageBScaleX: 1.2,
                smoothing: false,
            }),
        )
        await act(async () => {
            state.mode = "sbs"
        })
        await act(async () => {
            state.mode = "slider"
        })
        expect(compareDifference).toHaveBeenCalledTimes(2)
    })

    it("waits for loads, including a same-size replacement whose dimensions are already known", async () => {
        const context = setup(false)
        await selectComparison(context)
        expect(compareDifference).not.toHaveBeenCalled()
        await act(async () => {
            for (const ref of [context.refs.imgARef, context.refs.imgBRef]) {
                Object.defineProperty(ref.current, "complete", { value: true })
                ref.current.dispatchEvent(new Event("load"))
            }
        })
        expect(compareDifference).toHaveBeenCalledTimes(1)
        await act(async () => {
            context.result.current.state.imageBSrc = "new-b.png"
            context.refs.imgBRef.current.src = "new-b.png"
            Object.defineProperty(context.refs.imgBRef.current, "complete", { value: false })
        })
        expect(compareDifference).toHaveBeenCalledTimes(1)
        await act(async () => {
            Object.defineProperty(context.refs.imgBRef.current, "complete", { value: true })
            context.refs.imgBRef.current.dispatchEvent(new Event("load"))
        })
        expect(compareDifference).toHaveBeenCalledTimes(2)
    })

    it("regenerates active alignment and smoothing changes but ignores viewport-only changes", async () => {
        const context = setup()
        await selectComparison(context)
        const { state } = context.result.current
        await act(async () => {
            state.imageBOffset.x = 5
        })
        await act(async () => {
            state.imageBScaleY = 1.1
        })
        await act(async () => {
            state.smoothing = false
        })
        expect(compareDifference).toHaveBeenCalledTimes(4)
        await act(async () => {
            state.viewportWidth = 1200
        })
        expect(compareDifference).toHaveBeenCalledTimes(4)
        await act(async () => {
            state.sliderGain = 20
        })
        expect(compareDifference).toHaveBeenCalledTimes(4)
        await act(async () => {
            context.result.current.generate()
        })
        expect(compareDifference).toHaveBeenCalledTimes(5)
    })

    it("retains the selected effect and regenerates an invalidated buffer", async () => {
        const context = setup()
        await selectComparison(context)
        await act(async () => {
            context.result.current.state.sliderTrail = "brightness"
        })
        expect(compareBrightness).toHaveBeenCalledTimes(1)
        await act(async () => {
            context.result.current.state.sliderTrail = "color"
        })
        expect(compareColor).toHaveBeenCalledTimes(1)
        await act(async () => {
            context.result.current.state.canvasContents = "none"
            context.result.current.generate()
        })
        expect(compareColor).toHaveBeenCalledTimes(2)
        await act(async () => {
            context.result.current.state.sliderTrail = "none"
        })
        expect(context.result.current.state.canvasContents).toBe("none")
        expect(context.result.current.displayedEffect).toBe("none")
    })

    it("never compares the previous source while a replacement is pending", async () => {
        const context = setup()
        await selectComparison(context)
        await act(async () => {
            context.result.current.state.imageASrc = "new-a.png"
        })
        expect(compareDifference).toHaveBeenCalledTimes(1)
        await act(async () => {
            context.refs.imgARef.current.src = "new-a.png"
            context.refs.imgARef.current.dispatchEvent(new Event("load"))
        })
        expect(compareDifference).toHaveBeenCalledTimes(2)
    })

    it("drops and releases a late raster after clearing and reselecting the same URL", async () => {
        const stale = Promise.withResolvers<raster.RasterSource>()
        const render = vi.spyOn(raster, "renderRaster").mockReturnValueOnce(stale.promise)
        const context = setup()
        await selectComparison(context)
        const { state } = context.result.current

        await act(async () => {
            state.imageBSrc = undefined
            state.imagePairRevision++
            state.imageBSrc = "b.png"
            state.imagePairRevision++
        })
        expect(render.mock.calls[0][1].aborted).toBe(true)
        expect(render).toHaveBeenCalledTimes(2)
        const latest = context.refs.offscreenCanvasRef.current
        expect(latest).not.toBeNull()

        const rejected = document.createElement("canvas")
        await act(async () => stale.resolve(rejected))
        expect(rejected.width).toBe(0)
        expect(context.refs.offscreenCanvasRef.current).toBe(latest)
    })

    it("drops a raster completed while Activity is hidden and rebuilds on reveal", async () => {
        const stale = Promise.withResolvers<raster.RasterSource>()
        const render = vi.spyOn(raster, "renderRaster").mockReturnValueOnce(stale.promise)
        const context = setup(true, true)
        await selectComparison(context)
        const { state } = context.result.current

        await act(async () => {
            state.mode = "alt"
        })
        expect(render.mock.calls[0][1].aborted).toBe(true)
        expect(render).toHaveBeenCalledTimes(1)

        const rejected = document.createElement("canvas")
        await act(async () => stale.resolve(rejected))
        expect(rejected.width).toBe(0)
        expect(context.refs.offscreenCanvasRef.current).toBeNull()

        await act(async () => {
            state.mode = "slider"
        })
        expect(render).toHaveBeenCalledTimes(2)
        expect(context.result.current.displayedEffect).toBe("difference")
    })

    it("hides a retained raster for old alignment while its replacement is pending", async () => {
        const context = setup(true, true)
        await selectComparison(context)
        expect(context.result.current.displayedEffect).toBe("difference")
        const previous = context.refs.offscreenCanvasRef.current
        const next = Promise.withResolvers<raster.RasterSource>()
        vi.spyOn(raster, "renderRaster").mockReturnValueOnce(next.promise)

        await act(async () => {
            context.result.current.state.mode = "align"
            context.result.current.state.imageBOffset.x = 12
        })
        await act(async () => {
            context.result.current.state.mode = "slider"
        })
        expect(context.result.current.displayedEffect).toBe("none")

        await act(async () => next.resolve(document.createElement("canvas")))
        expect(previous?.width).toBe(0)
        expect(context.result.current.displayedEffect).toBe("difference")
    })

    it("cancels a pending settings update on hide and applies the latest value on reveal", async () => {
        vi.useFakeTimers()
        try {
            const context = setup(true, true)
            await selectComparison(context)
            const { state } = context.result.current
            await act(async () => {
                state.sliderGain = 15
            })
            expect(compareDifference).toHaveBeenCalledTimes(1)
            expect(context.result.current.displayedEffect).toBe("difference")

            await act(async () => {
                state.mode = "alt"
            })
            await act(async () => vi.advanceTimersByTimeAsync(500))
            expect(compareDifference).toHaveBeenCalledTimes(1)

            await act(async () => {
                state.mode = "slider"
            })
            expect(compareDifference).toHaveBeenCalledTimes(2)
            expect(state.sliderRasterKey?.gain).toBe(15)
        } finally {
            vi.useRealTimers()
        }
    })

    it("does not cache failed generation and allows retry", async () => {
        const context = setup()
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
        try {
            vi.mocked(compareDifference).mockImplementationOnce(() => {
                throw new Error("read failed")
            })
            await selectComparison(context)
            expect(context.result.current.state.canvasContents).toBe("none")
            expect(context.result.current.displayedEffect).toBe("none")
            await act(async () => {
                context.result.current.generate()
            })
            expect(compareDifference).toHaveBeenCalledTimes(2)
            expect(context.result.current.state.canvasContents).toBe("difference")
        } finally {
            consoleError.mockRestore()
        }
    })
})
