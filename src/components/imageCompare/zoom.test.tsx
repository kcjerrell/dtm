// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { loadSettingsStore, updateSetting } from "@/state/settings"
import { useCreateImageCompareContext } from "./hooks"
import { ImageCompareContext, type SbsLayout } from "./state"

vi.mock("@tauri-store/valtio", () => import("@/mocks/tauri-store"))

// Observe zoom targets synchronously without waiting for spring animation frames.
vi.mock("motion/react", async (importOriginal) => {
    const motion = await importOriginal<typeof import("motion/react")>()
    return {
        ...motion,
        useSpring: (value: number | { get(): number }) =>
            motion.useMotionValue(typeof value === "number" ? value : value.get()),
    }
})

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
beforeAll(loadSettingsStore)
beforeEach(() => {
    updateSetting("app.zoomMode", "scroll")
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            disconnect() {}
        },
    )
})
const cleanups: (() => void)[] = []
afterEach(() => {
    for (const cleanup of cleanups.splice(0)) act(cleanup)
    vi.unstubAllGlobals()
})

async function setup(width: number, height: number, layout: SbsLayout) {
    function useContext() {
        const [, state, snap] = ImageCompareContext.useCreate()
        const [, hooks] = useCreateImageCompareContext(state, snap)
        return { state, hooks }
    }
    const result = {} as { current: ReturnType<typeof useContext> }
    const viewport = document.createElement("div")
    Object.defineProperties(viewport, {
        clientWidth: { value: 1000 },
        clientHeight: { value: 800, configurable: true },
        getBoundingClientRect: { value: () => ({ left: 0, top: 0, width: 1000, height: 800 }) },
    })
    function Harness() {
        result.current = useContext()
        result.current.hooks.refs.viewportRef.current = viewport
        return createElement("div", result.current.hooks.zoomHandlers)
    }
    const root = createRoot(viewport)
    await act(async () => root.render(createElement(Harness)))
    const surface = viewport.firstElementChild as HTMLElement
    surface.setPointerCapture = vi.fn()
    surface.hasPointerCapture = vi.fn(() => true)
    surface.releasePointerCapture = vi.fn()
    cleanups.push(() => root.unmount())
    await act(async () => {
        Object.assign(result.current.state, {
            mode: "sbs",
            sbsLayout: layout,
            imageAWidth: width,
            imageAHeight: height,
            imageBWidth: width,
            imageBHeight: height,
        })
    })
    function wheel(options: WheelEventInit) {
        const event = new WheelEvent("wheel", {
            clientX: 500,
            clientY: 400,
            cancelable: true,
            ...options,
        })
        act(() => {
            viewport.dispatchEvent(event)
        })
        return event
    }
    function pan(x: number, y: number, button = 0) {
        act(() => {
            for (const [type, clientX, clientY] of [
                ["pointerdown", 0, 0],
                ["pointermove", x, y],
                ["pointerup", x, y],
            ] as const) {
                const event = new PointerEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    clientX,
                    clientY,
                    button,
                    pointerId: 1,
                    pointerType: "mouse",
                })
                surface.dispatchEvent(event)
            }
        })
    }
    const zoom = (deltaY: number) => wheel({ deltaY })
    return { result, zoomOut: () => zoom(1000), zoom, pan, wheel, viewport }
}

describe("zoom gestures", () => {
    it("switches from wheel zoom and primary drag to trackpad pan, pinch, and middle drag", async () => {
        const { result, zoom, pan, wheel } = await setup(1000, 800, "vertical")
        await act(async () => {
            result.current.state.mode = "slider"
        })
        const { x, y, scale } = result.current.hooks.zoomStyle

        zoom(-500)
        const startX = x.get()
        const startY = y.get()
        pan(20, 10)
        expect([x.get(), y.get(), scale.get()]).toEqual([startX + 20, startY + 10, 2])
        pan(40, 30, 1)
        expect([x.get(), y.get(), scale.get()]).toEqual([startX + 20, startY + 10, 2])

        updateSetting("app.zoomMode", "pinch")
        const scroll = wheel({ deltaX: 30, deltaY: -40 })
        expect(scroll.defaultPrevented).toBe(true)
        expect([x.get(), y.get(), scale.get()]).toEqual([startX - 10, startY + 50, 2])

        pan(40, 30)
        expect([x.get(), y.get(), scale.get()]).toEqual([startX - 10, startY + 50, 2])
        pan(40, 30, 1)
        expect([x.get(), y.get(), scale.get()]).toEqual([startX + 30, startY + 80, 2])

        wheel({ deltaY: -125, ctrlKey: true, clientX: 600, clientY: 500 })
        expect([x.get(), y.get(), scale.get()]).toEqual([1.5 * startX - 5, 1.5 * startY + 70, 3])
        wheel({ deltaY: 125, ctrlKey: true, clientX: 600, clientY: 500 })
        expect([x.get(), y.get(), scale.get()]).toEqual([
            0.75 * startX + 47.5,
            0.75 * startY + 85,
            1.5,
        ])
    })

    it("uses relative WebKit pinch scales anchored in the side-by-side pane under the cursor", async () => {
        const { result, viewport, wheel } = await setup(1000, 800, "vertical")
        updateSetting("app.zoomMode", "pinch")
        const { refs, zoomStyle } = result.current.hooks
        const { scale, x } = zoomStyle
        const pane = (left: number) => {
            const element = document.createElement("div")
            element.getBoundingClientRect = () => new DOMRect(left, 0, 500, 800)
            return element
        }
        refs.sbsPaneARef.current = pane(0)
        refs.sbsPaneBRef.current = pane(500)
        const gesture = (type: string, factor: number) => {
            const event = new Event(type, { cancelable: true })
            Object.assign(event, { scale: factor, clientX: 750, clientY: 400 })
            act(() => {
                viewport.dispatchEvent(event)
            })
            expect(event.defaultPrevented).toBe(true)
        }

        const startX = x.get()
        gesture("gesturestart", 1)
        gesture("gesturechange", 1.5)
        gesture("gesturechange", 2)
        expect(scale.get()).toBe(2)
        // The center of pane B maps to x=250 in A, left of the transform origin at x=500.
        expect(x.get()).toBe(2 * startX + 250)
        gesture("gestureend", 2)

        const beforePan = x.get()
        wheel({ deltaX: 20 })
        expect(x.get()).toBe(beforePan - 20)

        gesture("gesturestart", 1)
        gesture("gesturechange", 0.75)
        gesture("gestureend", 0.75)
        expect(scale.get()).toBe(1.5)
    })
})

describe("SBS minimum zoom", () => {
    it.each([
        [1000, 800, "vertical", 0.46],
        [1000, 800, "horizontal", 0.45],
        [500, 1000, "vertical", 0.95],
        [1000, 500, "horizontal", 0.72],
    ] as const)("fits %s x %s content in %s panes", async (width, height, layout, minimum) => {
        const { result, zoomOut } = await setup(width, height, layout)
        zoomOut()
        const { state, hooks } = result.current
        const scale = hooks.zoomStyle.scale.get()
        expect(scale).toBeCloseTo(minimum)
        const paneWidth = state.viewportWidth / (layout === "vertical" ? 2 : 1)
        const paneHeight = state.viewportHeight / (layout === "horizontal" ? 2 : 1)
        expect(state.contentSize.width * scale).toBeLessThanOrEqual(paneWidth - 40)
        expect(state.contentSize.height * scale).toBeLessThanOrEqual(paneHeight - 40)
        // Fully fitted content is centered in each pane.
        expect(
            state.contentOffset.left + state.contentSize.width / 2 + hooks.zoomStyle.x.get(),
        ).toBeCloseTo(paneWidth / 2)
        expect(
            state.contentOffset.top + state.contentSize.height / 2 + hooks.zoomStyle.y.get(),
        ).toBeCloseTo(paneHeight / 2)
    })

    it("reclamps zoom when the layout, viewport, or mode raises the minimum", async () => {
        const { result, zoomOut, viewport } = await setup(1000, 500, "vertical")
        zoomOut()
        expect(result.current.hooks.zoomStyle.scale.get()).toBeCloseTo(0.46)
        await act(async () => {
            result.current.state.sbsLayout = "horizontal"
        })
        expect(result.current.hooks.zoomStyle.scale.get()).toBeCloseTo(0.72)
        await act(async () => {
            Object.defineProperty(viewport, "clientHeight", { value: 1000 })
            window.dispatchEvent(new Event("resize"))
        })
        expect(result.current.hooks.zoomStyle.scale.get()).toBeCloseTo(0.92)
        await act(async () => {
            result.current.state.sbsLayout = "vertical"
        })
        zoomOut()
        expect(result.current.hooks.zoomStyle.scale.get()).toBeCloseTo(0.46)
        await act(async () => {
            result.current.state.mode = "slider"
        })
        expect(result.current.hooks.zoomStyle.scale.get()).toBeCloseTo(0.96)
        zoomOut()
        expect(result.current.hooks.zoomStyle.scale.get()).toBeCloseTo(0.96)
    })
})

describe("minimum zoom margin", () => {
    it.each(["slider", "alt", "align"])("leaves 20px around the image in %s mode", async (mode) => {
        const { result, zoomOut } = await setup(1000, 800, "vertical")
        await act(async () => {
            result.current.state.mode = mode
        })
        zoomOut()
        const { state, hooks } = result.current
        const scale = hooks.zoomStyle.scale.get()
        expect(scale).toBeCloseTo(0.95)
        expect((state.viewportWidth - state.contentSize.width * scale) / 2).toBeGreaterThanOrEqual(
            20,
        )
        expect((state.viewportHeight - state.contentSize.height * scale) / 2).toBeCloseTo(20)
        expect(hooks.zoomStyle.x.get()).toBe(0)
        expect(hooks.zoomStyle.y.get()).toBe(0)
    })

    it("keeps a positive scale when a pane is smaller than the margins", async () => {
        const { result, zoomOut, viewport } = await setup(1000, 800, "horizontal")
        await act(async () => {
            Object.defineProperty(viewport, "clientHeight", { value: 60 })
            window.dispatchEvent(new Event("resize"))
        })
        zoomOut()
        const { state, hooks } = result.current
        expect(hooks.zoomStyle.scale.get()).toBeGreaterThan(0)
        expect(state.contentSize.height * hooks.zoomStyle.scale.get()).toBeCloseTo(1)
    })
})

describe("pan margins", () => {
    it.each([
        ["slider", "vertical"],
        ["alt", "vertical"],
        ["align", "vertical"],
        ["sbs", "vertical"],
        ["sbs", "horizontal"],
    ] as const)("scales the gap at every edge in %s (%s)", async (mode, layout) => {
        const { result, zoom, zoomOut, pan } = await setup(1000, 800, layout)
        await act(async () => {
            result.current.state.mode = mode
        })
        const { state, hooks } = result.current
        const paneWidth = state.viewportWidth / (mode === "sbs" && layout === "vertical" ? 2 : 1)
        const paneHeight =
            state.viewportHeight / (mode === "sbs" && layout === "horizontal" ? 2 : 1)
        const { width, height } = state.contentSize
        const { left, top } = state.contentOffset

        for (const scale of [1, 2, 4]) {
            if (scale > 1) zoom(-500)
            expect(hooks.zoomStyle.scale.get()).toBe(scale)
            const margin = 20 * scale
            pan(10000, 10000)
            expect(left + (width * (1 - scale)) / 2 + hooks.zoomStyle.x.get()).toBeCloseTo(margin)
            expect(top + (height * (1 - scale)) / 2 + hooks.zoomStyle.y.get()).toBeCloseTo(margin)

            pan(-20000, -20000)
            expect(left + (width * (1 + scale)) / 2 + hooks.zoomStyle.x.get()).toBeCloseTo(
                paneWidth - margin,
            )
            expect(top + (height * (1 + scale)) / 2 + hooks.zoomStyle.y.get()).toBeCloseTo(
                paneHeight - margin,
            )
        }

        zoomOut()
        const centered = { x: hooks.zoomStyle.x.get(), y: hooks.zoomStyle.y.get() }
        pan(10000, 10000)
        expect(hooks.zoomStyle.x.get()).toBeCloseTo(centered.x)
        expect(hooks.zoomStyle.y.get()).toBeCloseTo(centered.y)
    })

    it.each([
        [1000, 200, "y"],
        [200, 1000, "x"],
    ] as const)("keeps the short axis centered for %s x %s images", async (width, height, axis) => {
        const { result, zoom, pan } = await setup(width, height, "vertical")
        await act(async () => {
            result.current.state.mode = "align"
        })
        zoom(-500)
        pan(10000, 10000)
        expect(result.current.hooks.zoomStyle[axis].get()).toBe(0)
        pan(-20000, -20000)
        expect(result.current.hooks.zoomStyle[axis].get()).toBe(0)
    })
})
