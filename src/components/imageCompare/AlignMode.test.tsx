// @vitest-environment jsdom

import { motionValue } from "motion/react"
import { act, type PropsWithChildren } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useZoomable } from "../preview/useZoomable"
import AlignMode from "./AlignMode"
import { ImageCompareContext, type ImageCompareState } from "./state"

// Observe pan targets without waiting for spring animation frames.
vi.mock("motion/react", async (importOriginal) => {
    const motion = await importOriginal<typeof import("motion/react")>()
    return { ...motion, useSpring: motion.useMotionValue }
})

vi.mock("@chakra-ui/react", () => ({
    Box: ({ children }: PropsWithChildren) => <div>{children}</div>,
}))
vi.mock("../IconButton", () => ({
    default: ({
        children,
        onClick,
        disabled,
        "aria-label": label,
        "aria-pressed": pressed,
    }: {
        children: React.ReactNode
        onClick?: () => void
        disabled?: boolean
        "aria-label"?: string
        "aria-pressed"?: boolean
    }) => (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            aria-pressed={pressed}
        >
            {children}
        </button>
    ),
}))
vi.mock("./AlignmentPanel", () => ({ default: () => null }))
vi.mock("./common", () => ({
    ToolbarSection: ({ children }: PropsWithChildren) => <div>{children}</div>,
}))
vi.mock("./hooks", () => ({ useImageCompareHooks: () => testHooks }))

const testHooks = {
    zoomStyle: { x: motionValue(0), y: motionValue(0), scale: motionValue(1) },
    refs: {
        imgBRef: { current: null },
        viewportRef: { current: document.createElement("div") },
    },
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const captured = new WeakMap<Element, number>()
HTMLElement.prototype.setPointerCapture = function (id) {
    captured.set(this, id)
}
HTMLElement.prototype.hasPointerCapture = function (id) {
    return captured.get(this) === id
}
HTMLElement.prototype.releasePointerCapture = function () {
    captured.delete(this)
}
const cleanups: (() => void)[] = []
afterEach(() => {
    for (const cleanup of cleanups.splice(0)) act(cleanup)
})

async function setup() {
    let state = {} as ImageCompareState
    function Harness() {
        const [Provider, current] = ImageCompareContext.useCreate()
        const pan = useZoomable(testHooks.refs.viewportRef)
        testHooks.zoomStyle = pan.style
        state = current
        return (
            <Provider>
                <div ref={testHooks.refs.viewportRef} {...pan.handlers}>
                    <AlignMode.View />
                </div>
                <AlignMode.Settings />
            </Provider>
        )
    }
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => root.render(<Harness />))
    Object.defineProperties(testHooks.refs.viewportRef.current, {
        clientWidth: { value: 500 },
        clientHeight: { value: 500 },
        getBoundingClientRect: { value: () => ({ left: 20, top: 30, width: 500, height: 500 }) },
    })
    await act(async () => {
        Object.assign(state, {
            mode: "align",
            imageASrc: "a.png",
            imageBSrc: "b.png",
            viewportWidth: 500,
            viewportHeight: 500,
            imageAWidth: 100,
            imageAHeight: 100,
            imageBWidth: 200,
            imageBHeight: 200,
        })
    })
    cleanups.push(() => {
        root.unmount()
        container.remove()
    })
    const find = (label: string) => {
        const element = container.querySelector<HTMLElement>(`[aria-label="${label}"]`)
        if (!element) throw new Error(`Missing ${label}`)
        return element
    }
    const click = async (label: string) => {
        await act(async () => find(label).click())
    }
    const pointer = async (type: string, x: number, y: number, shiftKey = true) => {
        await act(async () => {
            const event = new MouseEvent(type, {
                bubbles: true,
                clientX: x + 20,
                clientY: y + 30,
                button: 0,
                shiftKey,
            })
            Object.defineProperty(event, "pointerId", { value: 1 })
            find("Image B alignment").dispatchEvent(event)
        })
    }
    return { state, find, click, pointer }
}

describe("Align mode pin interaction", () => {
    it.each(["unpinned", "pinning", "pinned"])(
        "pans without changing alignment when %s and Shift is not held",
        async (mode) => {
            const { state, click, find, pointer } = await setup()
            if (mode !== "unpinned") await click("Pin")
            if (mode === "pinned") await pointer("pointerdown", 100, 150)
            const pin = state.pinState ? { ...state.pinState } : null

            await pointer("pointerdown", 300, 350, false)
            expect(find("Image B alignment").hasPointerCapture(1)).toBe(false)
            expect(testHooks.refs.viewportRef.current.hasPointerCapture(1)).toBe(true)
            await pointer("pointermove", 350, 375, false)
            await pointer("pointerup", 350, 375, false)

            expect(testHooks.zoomStyle.x.get()).toBe(50)
            expect(testHooks.zoomStyle.y.get()).toBe(25)
            expect(state.imageBOffset).toEqual({ x: 0, y: 0 })
            expect(state.imageBScaleX).toBe(1)
            expect(state.imageBScaleY).toBe(1)
            expect(state.pinState).toEqual(pin)
            expect(testHooks.refs.viewportRef.current.hasPointerCapture(1)).toBe(false)
        },
    )

    it("pans from a corner without Shift and translates with Shift without resizing", async () => {
        const { state, pointer } = await setup()
        await pointer("pointerdown", 0, 0, false)
        await pointer("pointermove", 50, 50, false)
        await pointer("pointerup", 50, 50, false)
        expect(state.imageBScaleX).toBe(1)
        expect(state.imageBOffset).toEqual({ x: 0, y: 0 })
        expect(testHooks.zoomStyle.x.get()).toBe(50)
        expect(testHooks.zoomStyle.y.get()).toBe(50)

        await pointer("pointerdown", 50, 50)
        await pointer("pointermove", 100, 100)
        await pointer("pointerup", 100, 100)
        expect(state.imageBScaleX).toBe(1)
        expect(state.imageBScaleY).toBe(1)
        expect(state.imageBOffset).toEqual({ x: 10, y: 10 })
        expect(testHooks.zoomStyle.x.get()).toBe(50)
        expect(testHooks.zoomStyle.y.get()).toBe(50)
    })

    it.each([false, true])("ends alignment when Shift is released (pinned: %s)", async (pinned) => {
        const { state, click, find, pointer } = await setup()
        if (pinned) {
            await click("Pin")
            await pointer("pointerdown", 100, 150)
        }
        await pointer("pointerdown", 300, 350)
        await pointer("pointermove", 350, 375)
        const alignment = {
            offset: { ...state.imageBOffset },
            scaleX: state.imageBScaleX,
            scaleY: state.imageBScaleY,
        }
        expect(find("Image B alignment").hasPointerCapture(1)).toBe(true)
        await pointer("pointermove", 400, 400, false)
        expect(find("Image B alignment").hasPointerCapture(1)).toBe(false)
        await pointer("pointermove", 450, 450, false)
        await pointer("pointerup", 450, 450, false)
        expect(state.imageBOffset).toEqual(alignment.offset)
        expect(state.imageBScaleX).toBe(alignment.scaleX)
        expect(state.imageBScaleY).toBe(alignment.scaleY)
        expect(testHooks.zoomStyle.x.get()).toBe(0)
        expect(testHooks.zoomStyle.y.get()).toBe(0)
    })

    it("toggles normal, pinning and pinned, including removal and replacement", async () => {
        const { state, click, find, pointer } = await setup()
        expect(state.alignPinEnabled).toBe(false)
        expect(find("Image B alignment").querySelector("button")).toBeNull()
        await click("Pin")
        expect(find("Pin").getAttribute("aria-pressed")).toBe("true")
        expect(find("Image B alignment").style.cursor).toBe("grab")
        await pointer("pointerdown", 100, 150)
        expect(state.pinState).toEqual({ ax: 20, ay: 30, bx: 40, by: 60 })
        await click("Remove alignment pin")
        expect(state.pinState).toBeNull()
        expect(state.alignPinEnabled).toBe(true)
        await pointer("pointerdown", 150, 200)
        expect(state.pinState).toEqual({ ax: 30, ay: 40, bx: 60, by: 80 })
        await click("Pin")
        expect(state.pinState).toBeNull()
        expect(state.alignPinEnabled).toBe(false)
        expect(find("Image B alignment").querySelector("button")).toBeNull()
    })

    it("keeps the anchor and pointer correspondence through zero and negative scaling", async () => {
        const { state, click, pointer } = await setup()
        await click("Pin")
        await pointer("pointerdown", 100, 150)
        await pointer("pointerdown", 300, 350)
        await pointer("pointermove", 100, 250)
        expect(state.imageBScaleX).toBe(0)
        expect(state.imageBScaleY).toBe(0.5)
        await pointer("pointermove", 0, 50)
        await pointer("pointerup", 0, 50)
        expect(state.imageBScaleX).toBe(-0.5)
        expect(state.imageBScaleY).toBe(-0.5)
        expect(state.pinState).toEqual({ ax: 20, ay: 30, bx: 40, by: 60 })
        expect(state.imageBOffset).toEqual({ x: -45, y: -30 })
        await click("Reset alignment")
        expect(state.pinState).toBeNull()
        expect(state.alignPinEnabled).toBe(true)
        expect(state.imageBScaleX).toBe(1)
        expect(state.imageBScaleY).toBe(1)
    })

    it("cancels pointer capture on toggle and restores normal translation", async () => {
        const { state, click, pointer, find } = await setup()
        await click("Pin")
        await pointer("pointerdown", 100, 150)
        await pointer("pointerdown", 300, 350)
        expect(find("Image B alignment").hasPointerCapture(1)).toBe(true)
        await click("Pin")
        expect(find("Image B alignment").hasPointerCapture(1)).toBe(false)
        await pointer("pointermove", 400, 450)
        expect(state.imageBScaleX).toBe(1)
        expect(state.imageBOffset).toEqual({ x: 0, y: 0 })
        await pointer("pointerdown", 300, 350)
        await pointer("pointermove", 350, 375)
        await pointer("pointerup", 350, 375)
        expect(state.imageBOffset).toEqual({ x: 10, y: 5 })
        expect(testHooks.zoomStyle.x.get()).toBe(0)
        expect(testHooks.zoomStyle.y.get()).toBe(0)
    })
})
