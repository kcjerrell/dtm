// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useCreateImageCompareContext } from "./hooks"
import { ImageCompareContext } from "./state"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const sizes: Record<string, readonly [number, number]> = {
    "a.png": [1024, 768],
    "b.png": [640, 480],
    "next-a.png": [1200, 800],
    "next-b.png": [900, 600],
}
const decode = vi.fn<(src: string) => Promise<void>>()
beforeEach(() => {
    decode.mockReset().mockResolvedValue(undefined)
    vi.stubGlobal(
        "Image",
        class {
            src = ""
            get naturalWidth() {
                return sizes[this.src][0]
            }
            get naturalHeight() {
                return sizes[this.src][1]
            }
            decode() {
                return decode(this.src)
            }
        },
    )
})

const cleanups: (() => void)[] = []
afterEach(() => {
    for (const cleanup of cleanups.splice(0)) act(cleanup)
    vi.unstubAllGlobals()
})

function useTestContext() {
    const [, state, snap] = ImageCompareContext.useCreate()
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

async function loadInitialImages(context: ReturnType<typeof setup>) {
    await act(async () => {
        await Promise.all([
            context.result.current.hooks.setImage("A", "a.png"),
            context.result.current.hooks.setImage("B", "b.png"),
        ])
    })
}

function setAlignment(context: ReturnType<typeof setup>) {
    const { state } = context.result.current
    state.imageBOffset = { x: 12, y: -20 }
    state.imageBScaleX = 1.2
    state.imageBScaleY = 0.8
    state.alignPinEnabled = true
    state.pinState = { ax: 10, ay: 20, bx: 30, by: 40 }
    state.sliderTrail = state.canvasContents = "difference"
}

function expectAlignmentPreserved(context: ReturnType<typeof setup>) {
    const { state } = context.result.current
    expect(state.imageBOffset).toEqual({ x: 12, y: -20 })
    expect(state.imageBScaleX).toBe(1.2)
    expect(state.imageBScaleY).toBe(0.8)
    expect(state.pinState).toEqual({ ax: 10, ay: 20, bx: 30, by: 40 })
    expect(state.canvasContents).toBe("difference")
}

describe("setImage", () => {
    it("loads initial sources and their actual dimensions", async () => {
        const context = setup()
        expect(context.result.current.state.imageASrc).toBeUndefined()
        expect(context.result.current.state.imageBSrc).toBeUndefined()
        await loadInitialImages(context)
        const { state } = context.result.current
        expect(state.imageASrc).toBe("a.png")
        expect(state.imageBSrc).toBe("b.png")
        expect([state.imageAWidth, state.imageAHeight]).toEqual([1024, 768])
        expect([state.imageBWidth, state.imageBHeight]).toEqual([640, 480])
        expect(state.imageBOffset).toEqual({ x: 0, y: 0 })
        expect(state.imageBScaleX).toBe(1)
        expect(state.imageBScaleY).toBe(1)
    })

    it.each([
        ["A", "next-a.png", "a.png", "b.png", [1200, 800], [640, 480]],
        ["B", "next-b.png", "a.png", "b.png", [1024, 768], [900, 600]],
        ["A", undefined, "a.png", "b.png", [512, 512], [640, 480]],
        ["B", undefined, "a.png", "b.png", [1024, 768], [512, 512]],
    ] as const)(
        "resets shared comparison state when %s changes to %s",
        async (side, src, previousA, previousB, sizeA, sizeB) => {
            const context = setup()
            await loadInitialImages(context)
            const { state, hooks } = context.result.current
            const canvases = Array.from({ length: 3 }, () => document.createElement("canvas"))
            hooks.refs.offscreenCanvasRef.current = canvases[0]
            hooks.refs.normalCanvasRef.current = canvases[1]
            hooks.refs.invertedCanvasRef.current = canvases[2]

            await act(async () => {
                setAlignment(context)
                await hooks.setImage(side, src)
            })

            expect(state.imageASrc).toBe(side === "A" ? src : previousA)
            expect(state.imageBSrc).toBe(side === "B" ? src : previousB)
            expect([state.imageAWidth, state.imageAHeight]).toEqual(sizeA)
            expect([state.imageBWidth, state.imageBHeight]).toEqual(sizeB)
            expect(state.imageBOffset).toEqual({ x: 0, y: 0 })
            expect(state.imageBScaleX).toBe(1)
            expect(state.imageBScaleY).toBe(1)
            expect(state.pinState).toBeNull()
            expect(state.alignPinEnabled).toBe(true)
            expect(state.sliderTrail).toBe("difference")
            expect(state.canvasContents).toBe("none")
            for (const canvas of canvases) expect([canvas.width, canvas.height]).toEqual([0, 0])
        },
    )

    it("preserves alignment and buffers without decoding unchanged sources", async () => {
        const context = setup()
        await loadInitialImages(context)
        const { hooks } = context.result.current
        const canvas = document.createElement("canvas")
        hooks.refs.offscreenCanvasRef.current = canvas
        decode.mockClear()

        await act(async () => {
            setAlignment(context)
            await hooks.setImage("A", "a.png")
            await hooks.setImage("B", "b.png")
        })

        expectAlignmentPreserved(context)
        expect(canvas.width).toBe(300)
        expect(decode).not.toHaveBeenCalled()
    })

    it.each(["A", "B"] as const)(
        "ignores a stale %s load without resetting the newer image's alignment or buffers",
        async (side) => {
            const context = setup()
            await loadInitialImages(context)
            const { state, hooks } = context.result.current
            const pending = Promise.withResolvers<void>()
            decode.mockImplementationOnce(() => pending.promise)
            const older = hooks.setImage(side, side === "A" ? "b.png" : "a.png")
            const latestSrc = side === "A" ? "next-a.png" : "next-b.png"
            const canvas = document.createElement("canvas")
            hooks.refs.offscreenCanvasRef.current = canvas

            await act(async () => {
                await hooks.setImage(side, latestSrc)
                setAlignment(context)
                canvas.width = 200
            })
            await act(async () => {
                pending.resolve()
                await older
            })

            expect(side === "A" ? state.imageASrc : state.imageBSrc).toBe(latestSrc)
            expect(
                side === "A"
                    ? [state.imageAWidth, state.imageAHeight]
                    : [state.imageBWidth, state.imageBHeight],
            ).toEqual(sizes[latestSrc])
            expectAlignmentPreserved(context)
            expect(canvas.width).toBe(200)
        },
    )

    it("commits B independently while A is still loading", async () => {
        const context = setup()
        await loadInitialImages(context)
        const { state, hooks } = context.result.current
        const pending = Promise.withResolvers<void>()
        decode.mockImplementationOnce(() => pending.promise)
        const loadingA = hooks.setImage("A", "next-a.png")

        await act(async () => {
            await hooks.setImage("B", "next-b.png")
        })
        expect(state.imageASrc).toBe("a.png")
        expect(state.imageBSrc).toBe("next-b.png")
        expect([state.imageBWidth, state.imageBHeight]).toEqual([900, 600])

        await act(async () => {
            pending.resolve()
            await loadingA
        })
        expect(state.imageASrc).toBe("next-a.png")
        expect(state.imageBSrc).toBe("next-b.png")
    })

    it.each(["A", "B"] as const)(
        "cancels a pending %s replacement when returning to the displayed image",
        async (side) => {
            const context = setup()
            await loadInitialImages(context)
            const { state, hooks } = context.result.current
            const pending = Promise.withResolvers<void>()
            decode.mockImplementationOnce(() => pending.promise)
            const replacement = hooks.setImage(side, "next-a.png")
            const displayedSrc = side === "A" ? "a.png" : "b.png"

            await act(async () => {
                setAlignment(context)
                await hooks.setImage(side, displayedSrc)
                pending.resolve()
                await replacement
            })

            expect(side === "A" ? state.imageASrc : state.imageBSrc).toBe(displayedSrc)
            expectAlignmentPreserved(context)
        },
    )

    it("keeps an image cleared when its pending replacement finishes", async () => {
        const context = setup()
        await loadInitialImages(context)
        const { state, hooks } = context.result.current
        const pending = Promise.withResolvers<void>()
        decode.mockImplementationOnce(() => pending.promise)
        const replacement = hooks.setImage("A", "next-a.png")

        await act(async () => {
            await hooks.setImage("A", undefined)
            pending.resolve()
            await replacement
        })

        expect(state.imageASrc).toBeUndefined()
        expect([state.imageAWidth, state.imageAHeight]).toEqual([512, 512])
        expect(state.imageBSrc).toBe("b.png")
    })
})
