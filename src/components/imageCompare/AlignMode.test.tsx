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
vi.mock("../toolbar/ToolbarButton", () => ({
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
vi.mock("../toolbar/ToolbarSection", () => ({
    ToolbarSection: ({ children }: PropsWithChildren) => <div>{children}</div>,
}))
vi.mock("./hooks", () => ({ useImageCompareHooks: () => testHooks }))
vi.mock("@/state/settings", () => ({
    useSettingRef: () => ({ current: "pinch" }),
}))

const testHooks = {
    zoomStyle: { x: motionValue(0), y: motionValue(0), scale: motionValue(1) },
    refs: {
        imgARef: { current: null as HTMLImageElement | null },
        imgBRef: { current: null as HTMLImageElement | null },
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
    testHooks.refs.imgARef.current = null
    testHooks.refs.imgBRef.current = null
    vi.restoreAllMocks()
})

async function setup(imageAWidth = 100, imageAHeight = 100, imageBWidth = 200, imageBHeight = 200) {
    let state = {} as ImageCompareState
    function Harness() {
        const [Provider, current] = ImageCompareContext.useCreate()
        const pan = useZoomable(testHooks.refs.viewportRef, { allowShiftDrag: true })
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
            imageAWidth,
            imageAHeight,
            imageBWidth,
            imageBHeight,
        })
    })
    cleanups.push(() => {
        root.unmount()
        container.remove()
    })
    const find = (label: string) => {
        const element = container.querySelector<HTMLElement>(
            `[aria-label="${label}"], [alt="${label}"]`,
        )
        if (!element) throw new Error(`Missing ${label}`)
        return element
    }
    const click = async (label: string) => {
        await act(async () => find(label).click())
    }
    const pointer = async (
        type: string,
        x: number,
        y: number,
        shiftKey = false,
        label = "Image B alignment",
        button = 0,
    ) => {
        await act(async () => {
            const event = new MouseEvent(type, {
                bubbles: true,
                clientX: x + 20,
                clientY: y + 30,
                button,
                shiftKey,
            })
            Object.defineProperty(event, "pointerId", { value: 1 })
            find(label).dispatchEvent(event)
        })
    }
    return { state, find, click, pointer }
}

describe("Align mode", () => {
    it("generates white edge buffers and reuses them across display modes and alignment", async () => {
        for (const side of ["A", "B"] as const) {
            const image = document.createElement("img")
            image.src = `${side.toLowerCase()}.png`
            Object.defineProperties(image, {
                complete: { value: true },
                naturalWidth: { value: 5 },
                naturalHeight: { value: 5 },
            })
            testHooks.refs[side === "A" ? "imgARef" : "imgBRef"].current = image
        }
        const context = {
            drawImage: vi.fn(),
            getImageData: vi.fn(() => {
                const data = new Uint8ClampedArray(5 * 5 * 4)
                for (let y = 0; y < 5; y++) {
                    for (let x = 0; x < 5; x++) {
                        const shade = x < 2 ? 0 : 255
                        data.set([shade, shade, shade, 255], (y * 5 + x) * 4)
                    }
                }
                return { data, width: 5, height: 5 }
            }),
            putImageData: vi.fn(),
        }
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            context as unknown as CanvasRenderingContext2D,
        )
        const { state, find, click } = await setup(5, 5, 5, 5)
        expect(find("A edges").getAttribute("width")).toBe("5")
        expect(find("B edges").getAttribute("width")).toBe("5")
        expect(find("B edges").style.opacity).toBe("1")
        expect(context.putImageData).toHaveBeenCalledTimes(2)
        expect([...context.putImageData.mock.calls[0][0].data.slice(4, 8)]).toEqual([
            255, 255, 255, 255,
        ])
        expect([...context.putImageData.mock.calls[1][0].data.slice(4, 8)]).toEqual([
            255, 255, 255, 255,
        ])
        await act(async () => {
            state.imageBOffset = { x: 10, y: 20 }
            state.imageBScaleX = -1
            state.imageBScaleY = 2
            testHooks.zoomStyle.x.set(50)
            testHooks.zoomStyle.scale.set(2)
        })
        expect(find("B edges").style.transform).toBe("scale(-1, 1)")
        expect(context.putImageData).toHaveBeenCalledTimes(2)
        for (const smoothing of [false, true]) {
            await act(async () => {
                state.smoothing = smoothing
            })
            const rendering = smoothing ? "auto" : "pixelated"
            expect(find("A edges").style.imageRendering).toBe(rendering)
            expect(find("B edges").style.imageRendering).toBe(rendering)
            expect(context.putImageData).toHaveBeenCalledTimes(2)
        }
        for (const label of ["Show original images", "Show B edges", "Show A and B edges"]) {
            await click(label)
            expect(context.putImageData).toHaveBeenCalledTimes(2)
            expect(state.imageBOffset).toEqual({ x: 10, y: 20 })
            expect(state.imageBScaleX).toBe(-1)
            expect(state.imageBScaleY).toBe(2)
        }
        await act(async () => {
            state.imageASrc = "new-a.png"
        })
        expect(find("A edges").getAttribute("width")).toBe("0")
        expect(find("B edges").getAttribute("width")).toBe("5")
    })

    it("switches between original, white B edges, and filtered screen-blended edges", async () => {
        const { state, find, click, pointer } = await setup()
        expect(find("Show A and B edges").getAttribute("aria-pressed")).toBe("true")
        const redFilter = find("A edges").style.filter
        const blueFilter = find("B edges").style.filter
        expect(redFilter).toMatch(/^url\("?#.+-A"?\)$/)
        expect(blueFilter).toMatch(/^url\("?#.+-B"?\)$/)
        expect(find("A edges").style.display).toBe("block")
        expect(find("B edges").style.opacity).toBe("1")
        expect(find("B edges").style.mixBlendMode).toBe("screen")
        expect(find("B original").style.display).toBe("none")
        await click("Pin")
        await pointer("pointerdown", 100, 150)
        const pin = { ...state.pinState }

        await click("Show original images")
        expect(state.alignDisplay).toBe("original")
        expect(find("Show original images").getAttribute("aria-pressed")).toBe("true")
        expect(find("Show A and B edges").getAttribute("aria-pressed")).toBe("false")
        expect(find("B original").getAttribute("src")).toBe("b.png")
        expect(find("B original").style.display).toBe("block")
        expect(find("B original").style.opacity).toBe("0.5")
        expect(find("A edges").style.display).toBe("none")
        expect(find("B edges").style.display).toBe("none")

        await click("Show B edges")
        expect(state.alignDisplay).toBe("b-edges")
        expect(find("Show B edges").getAttribute("aria-pressed")).toBe("true")
        expect(find("Show original images").getAttribute("aria-pressed")).toBe("false")
        expect(find("B original").style.display).toBe("none")
        expect(find("A edges").style.display).toBe("none")
        expect(find("B edges").style.display).toBe("block")
        expect(find("B edges").style.opacity).toBe("0.8")
        expect(find("B edges").style.filter).toBe("none")
        expect(find("B edges").style.mixBlendMode).toBe("normal")

        await click("Show A and B edges")
        expect(state.alignDisplay).toBe("both-edges")
        expect(find("A edges").style.filter).toBe(redFilter)
        expect(find("B edges").style.filter).toBe(blueFilter)
        expect(find("B edges").style.opacity).toBe("1")
        expect(find("B edges").style.mixBlendMode).toBe("screen")
        expect(state.pinState).toEqual(pin)
        expect(state.alignPinEnabled).toBe(true)
    })

    it.each([
        [512, 512, 1024, 1024, 1024, 1024, 1024, 1024],
        [384, 512, 1024, 1024, 768, 1024, 1024, 1024],
        [512, 384, 1024, 1024, 1024, 768, 1024, 1024],
        [1024, 1024, 384, 512, 1024, 1024, 768, 1024],
        [512, 1024, 1024, 512, 512, 1024, 1024, 512],
        [512, 512, 512, 512, 512, 512, 512, 512],
    ])(
        "fits %sx%s and %sx%s to a shared edge resolution",
        async (aw, ah, bw, bh, expectedAW, expectedAH, expectedBW, expectedBH) => {
            for (const [side, width, height] of [
                ["A", aw, ah],
                ["B", bw, bh],
            ] as const) {
                const image = document.createElement("img")
                image.src = `${side.toLowerCase()}.png`
                Object.defineProperties(image, {
                    complete: { value: true },
                    naturalWidth: { value: width },
                    naturalHeight: { value: height },
                })
                testHooks.refs[side === "A" ? "imgARef" : "imgBRef"].current = image
            }
            const context = {
                drawImage: vi.fn(),
                // Pixel convolution is covered separately; only observe raster sizes here.
                getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(), width: 0, height: 0 })),
                putImageData: vi.fn(),
            }
            vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
                context as unknown as CanvasRenderingContext2D,
            )
            const { find, state } = await setup(aw, ah, bw, bh)
            expect(find("A edges").getAttribute("width")).toBe(String(expectedAW))
            expect(find("A edges").getAttribute("height")).toBe(String(expectedAH))
            expect(find("B edges").getAttribute("width")).toBe(String(expectedBW))
            expect(find("B edges").getAttribute("height")).toBe(String(expectedBH))
            expect(context.drawImage).toHaveBeenNthCalledWith(
                1,
                testHooks.refs.imgARef.current,
                0,
                0,
                expectedAW,
                expectedAH,
            )
            expect(context.drawImage).toHaveBeenNthCalledWith(
                2,
                testHooks.refs.imgBRef.current,
                0,
                0,
                expectedBW,
                expectedBH,
            )
            expect(context.getImageData).toHaveBeenNthCalledWith(1, 0, 0, expectedAW, expectedAH)
            expect(context.getImageData).toHaveBeenNthCalledWith(2, 0, 0, expectedBW, expectedBH)

            // Changing the partner's resolution also updates the shared raster scale.
            if (aw === 384 && ah === 512) {
                await act(async () => {
                    state.imageBSrc = "larger-b.png"
                    state.imageBWidth = 2048
                    state.imageBHeight = 2048
                })
                expect(find("A edges").getAttribute("width")).toBe("1536")
                expect(find("A edges").getAttribute("height")).toBe("2048")
                expect(context.drawImage).toHaveBeenCalledTimes(3)
                expect(find("B edges").getAttribute("width")).toBe("0")
            }
        },
    )

    it.each(["unpinned", "pinning", "pinned"])(
        "pans without changing alignment when %s and Shift is held",
        async (mode) => {
            const { state, click, find, pointer } = await setup()
            if (mode !== "unpinned") await click("Pin")
            if (mode === "pinned") await pointer("pointerdown", 100, 150)
            const pin = state.pinState ? { ...state.pinState } : null

            await pointer("pointerdown", 300, 350, true)
            expect(find("Image B alignment").hasPointerCapture(1)).toBe(false)
            expect(testHooks.refs.viewportRef.current.hasPointerCapture(1)).toBe(true)
            await pointer("pointermove", 350, 375, true)
            await pointer("pointerup", 350, 375, true)

            expect(testHooks.zoomStyle.x.get()).toBe(50)
            expect(testHooks.zoomStyle.y.get()).toBe(25)
            expect(state.imageBOffset).toEqual({ x: 0, y: 0 })
            expect(state.imageBScaleX).toBe(1)
            expect(state.imageBScaleY).toBe(1)
            expect(state.pinState).toEqual(pin)
            expect(testHooks.refs.viewportRef.current.hasPointerCapture(1)).toBe(false)
        },
    )

    it("pans from a resize handle with Shift and moves B from its interior without Shift", async () => {
        const { state, pointer } = await setup()
        await pointer("pointerdown", 6, 6, true, "Scale image B from top left")
        await pointer("pointermove", 56, 56, true)
        await pointer("pointerup", 56, 56, true)
        expect(state.imageBScaleX).toBe(1)
        expect(state.imageBOffset).toEqual({ x: 0, y: 0 })
        expect(testHooks.zoomStyle.x.get()).toBe(50)
        expect(testHooks.zoomStyle.y.get()).toBe(50)

        await pointer("pointerdown", 150, 150)
        await pointer("pointermove", 200, 200)
        await pointer("pointerup", 200, 200)
        expect(state.imageBScaleX).toBe(1)
        expect(state.imageBScaleY).toBe(1)
        expect(state.imageBOffset).toEqual({ x: 10, y: 10 })
        expect(testHooks.zoomStyle.x.get()).toBe(50)
        expect(testHooks.zoomStyle.y.get()).toBe(50)
    })

    it("pans with middle drag over the active alignment pin", async () => {
        const { state, click, pointer } = await setup()
        await click("Pin")
        await pointer("pointerdown", 100, 150)
        const pin = state.pinState
        await pointer("pointerdown", 100, 150, false, "Remove alignment pin", 1)
        expect(testHooks.refs.viewportRef.current.hasPointerCapture(1)).toBe(true)
        await pointer("pointermove", 120, 175)
        await pointer("pointerup", 120, 175)
        expect(testHooks.zoomStyle.x.get()).toBe(20)
        expect(testHooks.zoomStyle.y.get()).toBe(25)
        expect(state.pinState).toEqual(pin)
        expect(state.imageBOffset).toEqual({ x: 0, y: 0 })
    })

    it.each([
        ["right", 394, 250, -0.72, 0.4, 6, 0],
        ["bottom", 250, 344, -0.6, 0.48, 0, 4],
        ["bottom right", 394, 344, -0.72, 0.48, 6, 4],
    ] as const)(
        "resizes a reflected image from the %s handle",
        async (handle, x, y, scaleX, scaleY, offsetX, offsetY) => {
            const { state, find, pointer } = await setup()
            await act(async () => {
                state.imageBScaleX = -0.6
                state.imageBScaleY = 0.4
            })
            await pointer("pointerdown", x, y, false, `Scale image B from ${handle}`)
            expect(find("Image B alignment").hasPointerCapture(1)).toBe(true)
            await pointer("pointermove", x + 60, y + 40)
            await pointer("pointerup", x + 60, y + 40)

            expect(state.imageBScaleX).toBeCloseTo(scaleX)
            expect(state.imageBScaleY).toBeCloseTo(scaleY)
            expect(state.imageBOffset.x).toBeCloseTo(offsetX)
            expect(state.imageBOffset.y).toBeCloseTo(offsetY)
            expect(testHooks.zoomStyle.x.get()).toBe(0)
            expect(testHooks.zoomStyle.y.get()).toBe(0)
            expect(find("Image B alignment").hasPointerCapture(1)).toBe(false)
        },
    )

    it.each([false, true])("ends alignment when Shift is pressed (pinned: %s)", async (pinned) => {
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
        await pointer("pointermove", 400, 400, true)
        expect(find("Image B alignment").hasPointerCapture(1)).toBe(false)
        await pointer("pointermove", 450, 450, true)
        await pointer("pointerup", 450, 450, true)
        expect(state.imageBOffset).toEqual(alignment.offset)
        expect(state.imageBScaleX).toBe(alignment.scaleX)
        expect(state.imageBScaleY).toBe(alignment.scaleY)
        expect(testHooks.zoomStyle.x.get()).toBe(0)
        expect(testHooks.zoomStyle.y.get()).toBe(0)
    })

    it("toggles normal, pinning and pinned, including removal and replacement", async () => {
        const { state, click, find, pointer } = await setup()
        const imageB = find("Image B alignment")
        const border = imageB.querySelector("svg")
        expect(state.alignPinEnabled).toBe(false)
        expect(imageB.querySelectorAll("button")).toHaveLength(8)
        expect(border?.style.opacity).toBe("1")
        await click("Pin")
        expect(find("Pin").getAttribute("aria-pressed")).toBe("true")
        expect(imageB.querySelector("button")).toBeNull()
        expect(imageB.style.cursor).toBe("crosshair")
        expect(border?.style.opacity).toBe("0.7")
        await pointer("pointerdown", 100, 150)
        await pointer("pointermove", 150, 200)
        await pointer("pointerup", 150, 200)
        expect(state.pinState).toEqual({ ax: 20, ay: 30, bx: 40, by: 60 })
        expect(state.imageBOffset).toEqual({ x: 0, y: 0 })
        expect(state.imageBScaleX).toBe(1)
        expect(state.imageBScaleY).toBe(1)
        expect(imageB.querySelector("button")).toBeNull()
        expect(border?.style.opacity).toBe("1")
        await click("Remove alignment pin")
        expect(state.pinState).toBeNull()
        expect(state.alignPinEnabled).toBe(true)
        expect(border?.style.opacity).toBe("0.7")
        await pointer("pointerdown", 150, 200)
        expect(state.pinState).toEqual({ ax: 30, ay: 40, bx: 60, by: 80 })
        await click("Pin")
        expect(state.pinState).toBeNull()
        expect(state.alignPinEnabled).toBe(false)
        expect(imageB.querySelectorAll("button")).toHaveLength(8)
    })

    it.each(["Pin", "Reset alignment", "leave Align"])(
        "cancels pin placement with %s",
        async (action) => {
            const { state, click, find } = await setup()
            await click("Pin")
            if (action === "leave Align") {
                await act(async () => {
                    state.mode = "slider"
                })
                expect(state.alignPinEnabled).toBe(false)
                await act(async () => {
                    state.mode = "align"
                })
            } else {
                await click(action)
            }
            expect(state.alignPinEnabled).toBe(false)
            expect(state.pinState).toBeNull()
            expect(find("Pin").getAttribute("aria-pressed")).toBe("false")
            expect(find("Image B alignment").querySelectorAll("button")).toHaveLength(8)
        },
    )

    it("preserves an active pin when leaving and returning to Align", async () => {
        const { state, click, find, pointer } = await setup()
        await click("Pin")
        await pointer("pointerdown", 100, 150)
        await pointer("pointerup", 100, 150)
        const pin = state.pinState
        await act(async () => {
            state.mode = "slider"
        })
        expect(state.alignPinEnabled).toBe(true)
        expect(state.pinState).toBe(pin)
        await act(async () => {
            state.mode = "align"
        })
        expect(find("Pin").getAttribute("aria-pressed")).toBe("true")
        expect(find("Remove alignment pin")).toBeTruthy()
        await pointer("pointerdown", 300, 350)
        await pointer("pointermove", 400, 450)
        await pointer("pointerup", 400, 450)
        expect(state.imageBScaleX).toBeCloseTo(1.5)
        expect(state.imageBScaleY).toBeCloseTo(1.5)
        expect(state.pinState).toBe(pin)
    })

    it.each([
        {
            description: "keeps Y fixed for a horizontal grab",
            start: [300, 150],
            end: [400, 50],
            scale: [1.5, 1],
            offset: [30, -5],
        },
        {
            description: "keeps X fixed for a vertical grab",
            start: [100, 350],
            end: [200, 450],
            scale: [1, 1.5],
            offset: [10, 2.5],
        },
        {
            description: "uses half the X movement at a 12.5% starting ratio",
            start: [125, 350],
            end: [225, 400],
            scale: [3, 1.25],
            offset: [90, -1.25],
        },
        {
            description: "uses half the Y movement at a 12.5% starting ratio",
            start: [300, 125],
            end: [350, 25],
            scale: [1.25, 3],
            offset: [20, 25],
        },
        {
            description: "follows both pointer coordinates at the 25% threshold",
            start: [150, 350],
            end: [175, 450],
            scale: [1.5, 1.5],
            offset: [30, 2.5],
        },
        {
            description: "follows both pointer coordinates above the 25% threshold",
            start: [160, 350],
            end: [190, 400],
            scale: [1.5, 1.25],
            offset: [30, -1.25],
        },
    ])("$description", async (test) => {
        const { state, click, pointer } = await setup()
        await act(async () => {
            state.imageBOffset = { x: 10, y: -5 }
        })
        await click("Pin")
        await pointer("pointerdown", 100, 150)
        await pointer("pointerdown", test.start[0], test.start[1])
        await pointer("pointermove", test.end[0], test.end[1])
        await pointer("pointerup", test.end[0], test.end[1])

        expect(state.imageBScaleX).toBeCloseTo(test.scale[0])
        expect(state.imageBScaleY).toBeCloseTo(test.scale[1])
        expect(state.imageBOffset.x).toBeCloseTo(test.offset[0])
        expect(state.imageBOffset.y).toBeCloseTo(test.offset[1])
    })

    it("keeps the anchor fixed through zero and negative scaling", async () => {
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
