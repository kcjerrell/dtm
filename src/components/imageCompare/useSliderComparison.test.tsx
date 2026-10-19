// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { compareBrightness, compareColor, compareDifference } from "./compareImages"
import { ImageCompareContext } from "./state"
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

function setup(loaded = true) {
    const refs = {
        imgARef: { current: image("a.png", loaded) },
        imgBRef: { current: image("b.png", loaded) },
        offscreenCanvasRef: { current: document.createElement("canvas") },
    }
    const onGenerated = vi.fn()
    function useContext() {
        const [, state, snap] = ImageCompareContext.useCreate({ a: "a.png", b: "b.png" })
        const generate = useSliderComparison(state, snap, refs, onGenerated)
        return { state, generate }
    }
    const result = {} as { current: ReturnType<typeof useContext> }
    function Harness() {
        result.current = useContext()
        return null
    }
    const root = createRoot(document.createElement("div"))
    act(() => root.render(createElement(Harness)))
    cleanups.push(() => root.unmount())
    return { result, refs, onGenerated }
}

async function selectComparison(setupResult: ReturnType<typeof setup>) {
    await act(async () => {
        const { state } = setupResult.result.current
        state.imageAWidth = state.imageAHeight = state.imageBWidth = state.imageBHeight = 512
        state.sliderTrail = "difference"
    })
}

describe("slider comparison regeneration", () => {
    it("defers changes while inactive and reuses an unchanged buffer on return", async () => {
        const context = setup()
        await selectComparison(context)
        expect(compareDifference).toHaveBeenCalledTimes(1)
        const { state } = context.result.current
        await act(async () => {
            state.mode = "alt"
        })
        await act(async () => {
            state.imageBOffset = { x: 12, y: -3 }
            state.imageBScale = 1.2
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
                imageBScale: 1.2,
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
            state.imageBScale = 1.1
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
        expect(context.onGenerated).toHaveBeenLastCalledWith("none")
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

    it("does not cache failed generation and allows retry", async () => {
        const context = setup()
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
        try {
            vi.mocked(compareDifference).mockImplementationOnce(() => {
                throw new Error("read failed")
            })
            await selectComparison(context)
            expect(context.result.current.state.canvasContents).toBe("none")
            expect(context.onGenerated).toHaveBeenLastCalledWith("none")
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
