// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"
import { useCreateImageCompareContext } from "./hooks"
import { ImageCompareContext } from "./state"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const cleanups: (() => void)[] = []
afterEach(() => {
    for (const cleanup of cleanups.splice(0)) act(cleanup)
})

function useTestContext() {
    const [, state, snap] = ImageCompareContext.useCreate({ a: "a.png", b: "b.png" })
    const [, hooks] = useCreateImageCompareContext(state, snap)
    return { state, hooks }
}

function setup() {
    const result = {} as { current: ReturnType<typeof useTestContext> }
    function Harness() {
        result.current = useTestContext()
        return null
    }
    const root = createRoot(document.createElement("div"))
    act(() => root.render(createElement(Harness)))
    cleanups.push(() => root.unmount())
    return { result }
}

describe("setImages", () => {
    it("starts with neutral B alignment", () => {
        const { result } = setup()
        expect(result.current.state.imageBOffset).toEqual({ x: 0, y: 0 })
        expect(result.current.state.imageBScale).toBe(1)
    })

    it.each([
        ["next-a.png", "b.png", 0, 768],
        ["a.png", "next-b.png", 512, 0],
        ["b.png", "a.png", 0, 0],
        [undefined, undefined, 0, 0],
    ])(
        "resets pair alignment and only changed dimensions for %s / %s",
        async (a, b, widthA, widthB) => {
            const { result } = setup()
            const { state, hooks } = result.current
            const canvases = Array.from({ length: 3 }, () => document.createElement("canvas"))
            hooks.refs.offscreenCanvasRef.current = canvases[0]
            hooks.refs.normalCanvasRef.current = canvases[1]
            hooks.refs.invertedCanvasRef.current = canvases[2]

            await act(async () => {
                state.imageAWidth = state.imageAHeight = 512
                state.imageBWidth = state.imageBHeight = 768
                state.imageBOffset = { x: 12, y: -20 }
                state.imageBScale = 1.1
                state.sliderTrail = state.canvasContents = "difference"
                await hooks.setImages(a, b)
            })

            expect(state.imageASrc).toBe(a)
            expect(state.imageBSrc).toBe(b)
            expect([state.imageAWidth, state.imageAHeight]).toEqual([widthA, widthA])
            expect([state.imageBWidth, state.imageBHeight]).toEqual([widthB, widthB])
            expect(state.imageBOffset).toEqual({ x: 0, y: 0 })
            expect(state.imageBScale).toBe(1)
            expect(state.sliderTrail).toBe("difference")
            expect(state.canvasContents).toBe("none")
            for (const canvas of canvases) expect([canvas.width, canvas.height]).toEqual([0, 0])
        },
    )

    it("preserves alignment and comparison buffers when selecting the same pair", async () => {
        const { result } = setup()
        const { state, hooks } = result.current
        const canvas = document.createElement("canvas")
        hooks.refs.offscreenCanvasRef.current = canvas

        await act(async () => {
            state.imageAWidth = state.imageAHeight = 512
            state.imageBWidth = state.imageBHeight = 768
            state.imageBOffset = { x: 12, y: -20 }
            state.imageBScale = 1.1
            state.sliderTrail = state.canvasContents = "difference"
            await hooks.setImages("a.png", "b.png")
        })

        expect(state.imageBOffset).toEqual({ x: 12, y: -20 })
        expect(state.imageBScale).toBe(1.1)
        expect([state.imageAWidth, state.imageBWidth]).toEqual([512, 768])
        expect(state.canvasContents).toBe("difference")
        expect(canvas.width).toBe(300)
    })
})
