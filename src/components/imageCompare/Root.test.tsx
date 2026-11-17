// @vitest-environment jsdom

import { ChakraProvider, defaultSystem } from "@chakra-ui/react"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { comparisonZoomProperties } from "./imageGeometry"
import Root, { type ImageCompareRootProps } from "./Root"

vi.mock("@/state/settings", () => ({
    useSetting: () => ["compare"],
    useSettingRef: () => ({ current: "pinch" }),
}))

vi.mock("motion/react", async (importOriginal) => {
    const motion = await importOriginal<typeof import("motion/react")>()
    return {
        ...motion,
        useSpring: (value: number | { get(): number }) =>
            motion.useMotionValue(typeof value === "number" ? value : value.get()),
    }
})

beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    vi.stubGlobal(
        "Image",
        class {
            naturalWidth = 640
            naturalHeight = 480
            async decode() {}
        },
    )
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    )
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

function withTheme({ children }: PropsWithChildren) {
    return <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>
}

function setup(props: ImageCompareRootProps = {}) {
    return render(<Root {...props} />, { wrapper: withTheme })
}

async function cycleMode(shiftKey: boolean) {
    await act(async () => {
        fireEvent.keyDown(document.activeElement ?? document.body, {
            key: "Tab",
            code: "Tab",
            shiftKey,
        })
    })
}

async function dragSlider(thumb: HTMLElement, expectedValue: string) {
    const control = thumb.parentElement
    if (!control) throw new Error("Missing slider control")
    vi.spyOn(control, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 80, 20))
    vi.spyOn(thumb, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 0, 20))
    const focus = vi.spyOn(thumb, "focus")
    await act(async () => {
        fireEvent.pointerDown(thumb, { pointerId: 1, button: 0, clientX: 0, clientY: 10 })
    })
    await waitFor(() => expect(focus).toHaveBeenCalled())
    await act(async () => {
        fireEvent.pointerMove(document, { pointerId: 1, clientX: 40, clientY: 10 })
        fireEvent.pointerUp(document, { pointerId: 1, button: 0, clientX: 40, clientY: 10 })
    })
    await waitFor(() => expect(thumb.getAttribute("aria-valuenow")).toBe(expectedValue))
    expect(document.activeElement).toBe(document.body)
}

it("settles on the latest settings after consecutive mode changes", async () => {
    setup()

    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Align" }))
    })
    const reset = screen.getByRole("button", { name: "Reset alignment" })

    await cycleMode(true)
    const vertical = screen.getByRole("button", { name: "Vertical layout" })

    await waitFor(() => expect(reset.isConnected).toBe(false))
    expect(screen.getByRole("button", { name: "Vertical layout" })).toBe(vertical)
})

it("restores the selected layout when returning to side-by-side mode", async () => {
    setup()
    await cycleMode(true)
    await cycleMode(true)

    const horizontal = screen.getByRole("button", { name: "Horizontal layout" })
    await act(async () => {
        fireEvent.click(horizontal)
    })
    expect(horizontal.getAttribute("aria-pressed")).toBe("true")

    await cycleMode(false)
    await waitFor(() => expect(horizontal.isConnected).toBe(false))
    await cycleMode(true)

    expect(screen.getByRole("button", { name: "Horizontal layout", pressed: true })).toBeTruthy()
})

it("cycles modes after interacting with the Slider and Swap settings", async () => {
    setup({ a: "a.png", b: "b.png" })
    const sliderSettings = screen.getByRole("button", { name: "Slider effect settings" })
    await act(async () => fireEvent.mouseEnter(sliderSettings))
    const settings = await screen.findByRole("dialog")
    const [threshold, gain] = within(settings).getAllByRole("slider")
    await dragSlider(threshold, "0.1")
    await dragSlider(gain, "11")
    await cycleMode(false)

    const speed = screen.getByRole("slider", { name: "Alternation speed" })
    await dragSlider(speed, "5")
    await cycleMode(false)

    const layout = screen.getByRole("button", { name: "Vertical layout" })
    await act(async () => layout.focus())
    expect(document.activeElement).toBe(document.body)
    await cycleMode(false)
    expect(screen.getByRole("button", { name: "Adjust alignment" })).toBeTruthy()
})

it("focuses the first alignment field and wraps Tab in both directions", async () => {
    setup({ a: "a.png", b: "b.png" })
    await cycleMode(true)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Adjust alignment" })))

    const panel = await screen.findByRole("dialog", { name: "Image B alignment" })
    const fields = ["X offset", "Y offset", "Scale X (%)", "Scale Y (%)"].map((name) =>
        within(panel).getByRole("spinbutton", { name }),
    )
    await waitFor(() => expect(document.activeElement).toBe(fields[0]))

    for (const field of [...fields.slice(1), fields[0]]) {
        await cycleMode(false)
        expect(document.activeElement).toBe(field)
    }
    await cycleMode(true)
    expect(document.activeElement).toBe(fields[3])

    await act(async () => fireEvent.keyDown(fields[3], { key: "Escape", code: "Escape" }))
    await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Image B alignment" })).toBeNull(),
    )
    await cycleMode(false)
    expect(screen.getByRole("button", { name: "Slider effect settings" })).toBeTruthy()
})

it("continues cycling modes when manual alignment has no editable fields", async () => {
    setup({ a: "a.png" })
    await cycleMode(true)

    const settings = screen.getByRole<HTMLButtonElement>("button", { name: "Adjust alignment" })
    expect(settings.disabled).toBe(true)

    await cycleMode(false)
    expect(screen.getByRole("button", { name: "Slider effect settings" })).toBeTruthy()
})

it.each([
    ["image", false, "X"],
    ["resize handle", true, "Vertical layout"],
])("cycles modes with Tab after dragging the Align %s", async (surface, shiftKey, nextSetting) => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000)
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800)
    setup({ a: "a.png", b: "b.png" })
    await cycleMode(true)
    const outline = await screen.findByRole("group", { name: "Image B alignment" })
    const target =
        surface === "image"
            ? outline
            : outline.querySelector<HTMLElement>('[data-alignment-handle="nw"]')
    if (!target) throw new Error("Missing alignment resize handle")

    const setPointerCapture = vi.fn()
    Object.assign(outline, { setPointerCapture, hasPointerCapture: () => false })
    fireEvent.pointerDown(target, { pointerId: 1, button: 0, clientX: 250, clientY: 300 })
    expect(setPointerCapture).toHaveBeenCalledWith(1)
    expect(document.activeElement).toBe(document.body)
    fireEvent.pointerMove(outline, { pointerId: 1, clientX: 260, clientY: 310 })
    fireEvent.pointerUp(outline, { pointerId: 1, button: 0 })
    target.focus()
    expect(document.activeElement).toBe(document.body)

    const onKeyDown = vi.fn()
    document.addEventListener("keydown", onKeyDown, { once: true })
    fireEvent.keyDown(target, { key: "ArrowRight", code: "ArrowRight" })
    document.removeEventListener("keydown", onKeyDown)
    expect(onKeyDown).toHaveBeenCalledOnce()

    await cycleMode(shiftKey)
    expect(screen.getByRole("button", { name: nextSetting })).toBeTruthy()
})

it.each(["toolbar", "keyboard"])(
    "cancels unfinished Align pin placement via the %s",
    async (control) => {
        setup({ a: "a.png", b: "b.png" })
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Align" })))

        await waitFor(() => {
            expect(screen.getByRole<HTMLButtonElement>("button", { name: "Pin" }).disabled).toBe(
                false,
            )
        })
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Pin" })))
        expect(screen.getByRole("button", { name: "Pin", pressed: true })).toBeTruthy()

        if (control === "toolbar") {
            await act(async () =>
                fireEvent.click(screen.getByRole("button", { name: "Side-by-side" })),
            )
        } else {
            await cycleMode(true)
        }
        await screen.findByRole("button", { name: "Vertical layout" })
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Align" })))
        expect(await screen.findByRole("button", { name: "Pin", pressed: false })).toBeTruthy()
    },
)

it("shows the latest image when revealing Swap and Side-by-side after a hidden replacement", async () => {
    const { container, rerender } = setup({ a: "a.png", b: "old-b.png" })
    const imageB = (mode: string) => container.querySelector(`#img-b-${mode}`)
    await waitFor(() => expect(imageB("slider")?.getAttribute("src")).toBe("old-b.png"))

    await act(async () => rerender(<Root a="a.png" b="new-b.png" />))
    await waitFor(() => expect(imageB("slider")?.getAttribute("src")).toBe("new-b.png"))
    await cycleMode(false)
    expect(imageB("alt")?.getAttribute("src")).toBe("new-b.png")
    await cycleMode(false)
    expect(imageB("sbs")?.getAttribute("src")).toBe("new-b.png")
})

it("keeps each revealed layer on the viewport's current transform after zoom and pan", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000)
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800)
    const { container } = setup({ a: "a.png", b: "b.png" })
    const viewport = container.querySelector<HTMLElement>("#image-compare-viewport")
    const stage = container.querySelector<HTMLElement>("#image-compare-stage")
    if (!viewport || !stage) throw new Error("Missing comparison viewport or stage")
    const readZoom = () => Number(viewport.style.getPropertyValue(comparisonZoomProperties.scale))
    const readPan = () => Number(viewport.style.getPropertyValue(comparisonZoomProperties.x))
    const expectTransform = (selector: string) => {
        const layer = container.querySelector<HTMLElement>(selector)?.parentElement
        expect(layer?.style.transform).toBe(stage.style.transform)
    }
    await waitFor(() => expect(container.querySelector("#img-b-alt")).toBeTruthy())
    await cycleMode(false)
    await cycleMode(false)
    await cycleMode(false)
    await screen.findByRole("button", { name: "Show A and B edges" })
    await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Show A and B edges" })),
    )
    await cycleMode(false)

    await waitFor(() => expect(readZoom()).toBeCloseTo(0.96))
    await act(async () => fireEvent.wheel(viewport, { ctrlKey: true, deltaY: -150 }))
    await waitFor(() => expect(readZoom()).toBeCloseTo(0.96 * 1.6))
    const beforePan = readPan()
    await act(async () => fireEvent.wheel(viewport, { deltaX: 35, deltaY: -25 }))
    await waitFor(() => expect(readPan()).not.toBe(beforePan))
    expect(stage.style.transform).toContain(comparisonZoomProperties.scale)

    await cycleMode(false)
    expectTransform("#img-b-alt")
    await cycleMode(false)
    expectTransform("#img-b-sbs")
    await cycleMode(false)
    expectTransform('canvas[aria-label="A edges"]')
    const outline = screen.getByRole("group", { name: "Image B alignment" })
    expect(outline.style.left).toContain(comparisonZoomProperties.x)
    expect(outline.style.top).toContain(comparisonZoomProperties.y)
    expect(outline.style.width).toContain(comparisonZoomProperties.scale)
    await cycleMode(false)
    expectTransform("#img-b-slider")
})
