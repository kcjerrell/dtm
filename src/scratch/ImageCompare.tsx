import { Box, Flex, Grid, HStack, Kbd } from "@chakra-ui/react"
import { motion, useMotionValue, useSpring, useTransform } from "motion/react"
import { type CSSProperties, useCallback, useEffect, useMemo, useRef } from "react"
import type { Snapshot } from "valtio"
import { CheckRoot, Panel } from "@/components"
import { PanelButton, PanelSectionHeader } from "@/components/common"
import { useZoomable } from "@/components/preview/useZoomable"
import { Slider } from "@/components/ui/slider"
import { useProxyRef } from "@/hooks/valtioHooks"
import { compareBrightness, compareColor, compareDifference } from "./compareImages"

const TRAIL_SPRING = {
    stiffness: 140,
    damping: 26,
    mass: 0.6,
    restDelta: 0.0005,
}
const MAX_TRAIL_LENGTH = 0.3
const TRAIL_FEATHER_WIDTH = 0.08
const MIN_VISIBLE_TRAIL_LENGTH = 0.002
const TRANSPARENT_MASK = "linear-gradient(to right, transparent, transparent)"

const ALT_ANIM_STYLE = {
    animationDuration: "var(--alt-duration)",
    animationPlayState: "var(--alt-state)",
    animationDelay: "calc(var(--alt-duration) * var(--alt-phase) * -1)",
} as CSSProperties

const TEST_IMG_A =
    "asset://localhost//Users/kcjer/Library/Application%20Support/com.kcjer.dtm/dev_images/38dzby284dv6.png"
const TEST_IMG_B =
    "asset://localhost//Users/kcjer/Library/Application%20Support/com.kcjer.dtm/dev_images/vm0kgvlpyklm.jpg"

type SliderEffect = "brightness" | "color" | "difference" | "none"
type SbsLayout = "horizontal" | "vertical"

type ImageCompareState = {
    /** The active comparison mode: slider, alternate, or side-by-side */
    mode: "slider" | "alt" | "sbs"
    /** The selected slider trail effect */
    sliderTrail: SliderEffect
    /** The slider trail effect currently stored in the canvas */
    canvasContents: SliderEffect
    /** true while the slider is currently being dragged */
    sliderDragging: boolean

    /** the value of the speed slider (0 to 10) */
    altSpeedInput: number
    /** the speed at which to alternate between A and B (1 to 10)*/
    altSpeed: number
    /** change the phase of the animation to alternate between images when paused */
    altPhase: 0.0 | 0.5

    /** arrange side-by-side images in a row or column */
    sbsLayout: SbsLayout

    /** whether or not the shift key is behind held down */
    shiftHeld: boolean

    /** state for zoom/pan and canvas alignment */
    viewportWidth: number
    viewportHeight: number
    imageAWidth: number
    imageAHeight: number
    imageBWidth: number
    imageBHeight: number
}

function containSize(
    contentWidth: number,
    contentHeight: number,
    viewportWidth: number,
    viewportHeight: number,
) {
    if (!contentWidth || !contentHeight || !viewportWidth || !viewportHeight) {
        return { width: 0, height: 0 }
    }

    const scale = Math.min(viewportWidth / contentWidth, viewportHeight / contentHeight)
    return { width: contentWidth * scale, height: contentHeight * scale }
}

function trailMask(sliderPosition: number, trailingPosition: number) {
    const distance = sliderPosition - trailingPosition
    if (Math.abs(distance) < MIN_VISIBLE_TRAIL_LENGTH) return TRANSPARENT_MASK

    const slider = Math.min(Math.max(sliderPosition, 0), 1)
    const trailing = Math.min(Math.max(trailingPosition, 0), 1)

    if (distance > 0) {
        const trailStart = Math.max(trailing, slider - MAX_TRAIL_LENGTH)
        const featherEnd = Math.min(slider, trailStart + TRAIL_FEATHER_WIDTH)

        return `linear-gradient(to right,
            transparent 0%,
            transparent ${trailStart * 100}%,
            black ${featherEnd * 100}%,
            black ${slider * 100}%,
            transparent ${slider * 100}%,
            transparent 100%)`
    }

    const trailEnd = Math.min(trailing, slider + MAX_TRAIL_LENGTH)
    const featherStart = Math.max(slider, trailEnd - TRAIL_FEATHER_WIDTH)

    return `linear-gradient(to right,
        transparent 0%,
        transparent ${slider * 100}%,
        black ${slider * 100}%,
        black ${featherStart * 100}%,
        transparent ${trailEnd * 100}%,
        transparent 100%)`
}

function ImageCompare() {
    const { state, snap } = useProxyRef<ImageCompareState>(() => ({
        mode: "slider",
        sliderTrail: "none",
        sliderDragging: false,
        canvasContents: "none",
        shiftHeld: false,
        altSpeedInput: 5,
        altSpeed: 5,
        altPhase: 0.0,
        sbsLayout: "horizontal",
        viewportWidth: 0,
        viewportHeight: 0,
        imageAWidth: 0,
        imageAHeight: 0,
        imageBWidth: 0,
        imageBHeight: 0,
    }))

    // the actual sliderTrail mode depends on shiftHeld
    const [sliderTrail, sliderButtonTone] = getSliderTrailAndTone(snap)

    const imgARef = useRef<HTMLImageElement>(null)
    const imgBRef = useRef<HTMLImageElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const viewportRef = useRef<HTMLDivElement>(null)
    const sbsPaneARef = useRef<HTMLDivElement>(null)
    const sbsPaneBRef = useRef<HTMLDivElement>(null)
    const dragRef = useRef<HTMLDivElement>(null)

    const contentWidth = Math.max(snap.imageAWidth, snap.imageBWidth)
    const contentHeight = Math.max(snap.imageAHeight, snap.imageBHeight)
    const contentSize = useMemo(
        () => containSize(contentWidth, contentHeight, snap.viewportWidth, snap.viewportHeight),
        [contentHeight, contentWidth, snap.viewportHeight, snap.viewportWidth],
    )
    const contentLeft = (snap.viewportWidth - contentSize.width) / 2
    const contentTop = (snap.viewportHeight - contentSize.height) / 2
    const imageAWidth = contentWidth ? `${(snap.imageAWidth / contentWidth) * 100}%` : "0%"
    const imageAHeight = contentHeight ? `${(snap.imageAHeight / contentHeight) * 100}%` : "0%"
    const imageBWidth = contentWidth ? `${(snap.imageBWidth / contentWidth) * 100}%` : "0%"
    const imageBHeight = contentHeight ? `${(snap.imageBHeight / contentHeight) * 100}%` : "0%"
    const sbsViewportSize = useMemo(
        () => ({
            width: snap.viewportWidth / (snap.sbsLayout === "horizontal" ? 2 : 1),
            height: snap.viewportHeight / (snap.sbsLayout === "vertical" ? 2 : 1),
        }),
        [snap.sbsLayout, snap.viewportHeight, snap.viewportWidth],
    )
    const contentOffset = useMemo(
        () => ({ left: contentLeft, top: contentTop }),
        [contentLeft, contentTop],
    )
    const mapSbsZoomPoint = useCallback((clientX: number, clientY: number) => {
        const paneA = sbsPaneARef.current?.getBoundingClientRect()
        const paneB = sbsPaneBRef.current?.getBoundingClientRect()

        if (
            paneA &&
            paneB &&
            clientX >= paneB.left &&
            clientX <= paneB.right &&
            clientY >= paneB.top &&
            clientY <= paneB.bottom
        ) {
            return {
                clientX: paneA.left + ((clientX - paneB.left) / paneB.width) * paneA.width,
                clientY: paneA.top + ((clientY - paneB.top) / paneB.height) * paneA.height,
            }
        }
        return { clientX, clientY }
    }, [])

    const { handlers: zoomHandlers, style: zoomStyle } = useZoomable(viewportRef, {
        contentSize,
        contentOffset,
        viewportSize: snap.mode === "sbs" ? sbsViewportSize : undefined,
        mapZoomPoint: snap.mode === "sbs" ? mapSbsZoomPoint : undefined,
        maxZoom: 16,
    })

    const sliderMv = useMotionValue(0.5)
    const dividerXMv = useMotionValue(0)
    const clipMv = useTransform(sliderMv, (value) => `inset(0 ${(1 - value) * 100}% 0 0)`)
    const trailingMv = useSpring(sliderMv, TRAIL_SPRING)
    const canvasMaskMv = useTransform<number, string>(
        [sliderMv, trailingMv],
        ([slider, trailing]) => trailMask(slider, trailing),
    )

    const altAnimationDuration = `${3 / snap.altSpeed}s`
    const altAnimationState = snap.shiftHeld || snap.altSpeedInput === 0 ? "paused" : "running"
    const altPhase = ((snap.shiftHeld && snap.altSpeedInput === 0 ? 0.5 : 0) + snap.altPhase) % 1

    const onLoad = useCallback(
        (img: "a" | "b", element: HTMLImageElement) => {
            if (img === "a") {
                state.imageAWidth = element.naturalWidth
                state.imageAHeight = element.naturalHeight
            } else {
                state.imageBWidth = element.naturalWidth
                state.imageBHeight = element.naturalHeight
            }

            const canvas = canvasRef.current
            const imageA = imgARef.current
            const imageB = imgBRef.current
            if (!canvas || !imageA?.naturalWidth || !imageB?.naturalWidth) return

            const width = Math.max(imageA.naturalWidth, imageB.naturalWidth)
            const height = Math.max(imageA.naturalHeight, imageB.naturalHeight)
            if (canvas.width !== width) canvas.width = width
            if (canvas.height !== height) canvas.height = height

            const ctx = canvas.getContext("2d")
            if (!ctx) return
            ctx.imageSmoothingEnabled = false
        },
        [state],
    )

    const drawComparison = useCallback(
        (effect: Exclude<SliderEffect, "none">) => {
            state.sliderTrail = effect
            if (!canvasRef.current || !imgARef.current || !imgBRef.current) return

            try {
                if (effect === "brightness") {
                    compareBrightness(imgARef.current, imgBRef.current, canvasRef.current, {
                        gain: 20,
                        threshold: 0.01,
                    })
                } else if (effect === "color") {
                    compareColor(imgARef.current, imgBRef.current, canvasRef.current, {
                        gain: 20,
                        threshold: 0.01,
                    })
                } else {
                    compareDifference(imgARef.current, imgBRef.current, canvasRef.current, {
                        gain: 20,
                        threshold: 0.01,
                    })
                }
                state.canvasContents = effect
            } catch (error) {
                console.error(error)
            }
        },
        [state],
    )

    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        const updateSize = () => {
            const width = viewport.clientWidth
            state.viewportWidth = width
            state.viewportHeight = viewport.clientHeight
            dividerXMv.set((sliderMv.get() - 0.5) * width)
        }
        const observer = new ResizeObserver(updateSize)
        observer.observe(viewport)
        updateSize()

        return () => observer.disconnect()
    }, [dividerXMv, sliderMv, state])

    useEffect(() => {
        const keydown = (e: KeyboardEvent) => {
            if (e.key === "Shift") {
                state.shiftHeld = true
            }
        }
        const keyup = (e: KeyboardEvent) => {
            if (e.key === "Shift") {
                state.shiftHeld = false
            }
        }
        document.addEventListener("keydown", keydown, { passive: true })
        document.addEventListener("keyup", keyup, { passive: true })

        return () => {
            document.removeEventListener("keydown", keydown)
            document.removeEventListener("keyup", keyup)
        }
    }, [state])

    return (
        <Flex width={"full"} height={"full"} padding={8}>
            <Panel width={"full"} height={"full"} justifyContent={"center"} alignItems={"center"}>
                <Grid
                    position={"relative"}
                    width={"full"}
                    height={"full"}
                    minWidth={0}
                    minHeight={0}
                    justifyContent={"stretch"}
                    alignItems={"stretch"}
                    templateColumns={"max-content 1fr max-content"}
                    templateRows={"minmax(0, 1fr) min-content"}
                    templateAreas={'"image image image" "mode hint opts"'}
                    cursor={snap.sliderDragging ? "none" : undefined}
                    // defining anim duration on common parent
                    style={
                        {
                            "--alt-duration": altAnimationDuration,
                            "--alt-state": altAnimationState,
                            "--alt-phase": altPhase,
                        } as CSSProperties
                    }
                >
                    <Box
                        id="image-compare-viewport"
                        ref={viewportRef}
                        gridArea={"image"}
                        position={"relative"}
                        minWidth={0}
                        minHeight={0}
                        overflow={"hidden"}
                        touchAction={"none"}
                        {...zoomHandlers}
                    >
                        <motion.div
                            id="image-compare-stage"
                            style={{
                                ...zoomStyle,
                                display: snap.mode === "sbs" ? "none" : "block",
                                position: "absolute",
                                left: contentLeft,
                                top: contentTop,
                                width: contentSize.width,
                                height: contentSize.height,
                                transformOrigin: "center center",
                                imageRendering: "pixelated",
                            }}
                        >
                            <motion.img
                                id={"img-a"}
                                crossOrigin="anonymous"
                                ref={imgARef}
                                draggable={false}
                                src={TEST_IMG_A}
                                alt=""
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    width: imageAWidth,
                                    height: imageAHeight,
                                    pointerEvents: "none",
                                    imageRendering: "pixelated",
                                }}
                                onLoad={(event) => onLoad("a", event.currentTarget)}
                            />
                        </motion.div>
                        <motion.div
                            style={{
                                display: snap.mode === "slider" ? "block" : "none",
                                position: "absolute",
                                inset: 0,
                                zIndex: 1,
                                clipPath: clipMv,
                                pointerEvents: "none",
                            }}
                        >
                            <motion.div
                                style={{
                                    ...zoomStyle,
                                    position: "absolute",
                                    left: contentLeft,
                                    top: contentTop,
                                    width: contentSize.width,
                                    height: contentSize.height,
                                    transformOrigin: "center center",
                                }}
                            >
                                <motion.img
                                    id={"img-b-slider"}
                                    crossOrigin="anonymous"
                                    ref={imgBRef}
                                    draggable={false}
                                    src={TEST_IMG_B}
                                    alt=""
                                    style={{
                                        position: "absolute",
                                        inset: 0,
                                        width: imageBWidth,
                                        height: imageBHeight,
                                        imageRendering: "pixelated",
                                    }}
                                    onLoad={(event) => onLoad("b", event.currentTarget)}
                                />
                            </motion.div>
                        </motion.div>
                        <motion.div
                            style={{
                                ...zoomStyle,
                                display: snap.mode === "alt" ? "block" : "none",
                                position: "absolute",
                                left: contentLeft,
                                top: contentTop,
                                width: contentSize.width,
                                height: contentSize.height,
                                transformOrigin: "center center",
                                zIndex: 1,
                                pointerEvents: "none",
                            }}
                        >
                            <motion.img
                                id={"img-b-alt"}
                                crossOrigin="anonymous"
                                draggable={false}
                                src={TEST_IMG_B}
                                alt=""
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    width: imageBWidth,
                                    height: imageBHeight,
                                    imageRendering: "pixelated",
                                    ...ALT_ANIM_STYLE,
                                }}
                                className="blink-anim"
                                onLoad={(event) => onLoad("b", event.currentTarget)}
                            />
                        </motion.div>
                        <motion.div
                            id="image-compare-sbs"
                            style={{
                                display: snap.mode === "sbs" ? "flex" : "none",
                                position: "absolute",
                                inset: 0,
                                flexDirection: snap.sbsLayout === "horizontal" ? "row" : "column",
                                imageRendering: "pixelated",
                            }}
                        >
                            <div
                                ref={sbsPaneARef}
                                style={{
                                    flex: "1 1 0",
                                    position: "relative",
                                    minWidth: 0,
                                    minHeight: 0,
                                    overflow: "hidden",
                                }}
                            >
                                <motion.div
                                    style={{
                                        ...zoomStyle,
                                        position: "absolute",
                                        left: contentLeft,
                                        top: contentTop,
                                        width: contentSize.width,
                                        height: contentSize.height,
                                        transformOrigin: "center center",
                                    }}
                                >
                                    <img
                                        id="img-a-sbs"
                                        crossOrigin="anonymous"
                                        draggable={false}
                                        src={TEST_IMG_A}
                                        alt=""
                                        style={{
                                            position: "absolute",
                                            inset: 0,
                                            width: imageAWidth,
                                            height: imageAHeight,
                                            pointerEvents: "none",
                                            imageRendering: "pixelated",
                                        }}
                                        onLoad={(event) => onLoad("a", event.currentTarget)}
                                    />
                                </motion.div>
                            </div>
                            <div
                                ref={sbsPaneBRef}
                                style={{
                                    flex: "1 1 0",
                                    position: "relative",
                                    minWidth: 0,
                                    minHeight: 0,
                                    overflow: "hidden",
                                }}
                            >
                                <motion.div
                                    style={{
                                        ...zoomStyle,
                                        position: "absolute",
                                        left: contentLeft,
                                        top: contentTop,
                                        width: contentSize.width,
                                        height: contentSize.height,
                                        transformOrigin: "center center",
                                    }}
                                >
                                    <img
                                        id="img-b-sbs"
                                        crossOrigin="anonymous"
                                        draggable={false}
                                        src={TEST_IMG_B}
                                        alt=""
                                        style={{
                                            position: "absolute",
                                            inset: 0,
                                            width: imageBWidth,
                                            height: imageBHeight,
                                            pointerEvents: "none",
                                            imageRendering: "pixelated",
                                        }}
                                        onLoad={(event) => onLoad("b", event.currentTarget)}
                                    />
                                </motion.div>
                            </div>
                        </motion.div>
                        <motion.div
                            style={{
                                display:
                                    snap.mode === "slider" && sliderTrail !== "none"
                                        ? "block"
                                        : "none",
                                position: "absolute",
                                inset: 0,
                                zIndex: 2,
                                pointerEvents: "none",
                                maskImage: canvasMaskMv,
                                WebkitMaskImage: canvasMaskMv,
                                maskRepeat: "no-repeat",
                                WebkitMaskRepeat: "no-repeat",
                            }}
                        >
                            <motion.div
                                style={{
                                    ...zoomStyle,
                                    position: "absolute",
                                    left: contentLeft,
                                    top: contentTop,
                                    width: contentSize.width,
                                    height: contentSize.height,
                                    transformOrigin: "center center",
                                }}
                            >
                                <motion.canvas
                                    id="image-compare-canvas"
                                    ref={canvasRef}
                                    style={{
                                        position: "absolute",
                                        inset: 0,
                                        width: "100%",
                                        height: "100%",
                                        pointerEvents: "none",
                                    }}
                                />
                            </motion.div>
                        </motion.div>
                        <Box
                            asChild
                            _hover={{ "& > *": { bgColor: "grays.12" } }}
                            cursor={snap.sliderDragging ? "none" : "ew-resize"}
                        >
                            <motion.div
                                id="image-compare-divider"
                                ref={dragRef}
                                drag="x"
                                dragMomentum={false}
                                dragConstraints={viewportRef}
                                dragElastic={0}
                                style={{
                                    display: snap.mode === "slider" ? "block" : "none",
                                    position: "absolute",
                                    width: "16px",
                                    height: "100%",
                                    left: "calc(50% - 8px)",
                                    top: 0,
                                    x: dividerXMv,
                                    zIndex: 3,
                                    touchAction: "none",
                                }}
                                onPointerDown={(event) => {
                                    event.stopPropagation()
                                }}
                                onDragStart={() => {
                                    state.sliderDragging = true
                                }}
                                onDragEnd={() => {
                                    state.sliderDragging = false
                                }}
                                onDrag={() => {
                                    const divider = dragRef.current
                                    const viewport = viewportRef.current
                                    if (!divider || !viewport) return
                                    const dividerRect = divider.getBoundingClientRect()
                                    const viewportRect = viewport.getBoundingClientRect()
                                    sliderMv.set(
                                        Math.min(
                                            Math.max(
                                                (dividerRect.x -
                                                    viewportRect.x +
                                                    dividerRect.width / 2) /
                                                    viewportRect.width,
                                                0,
                                            ),
                                            1,
                                        ),
                                    )
                                }}
                            >
                                <Box
                                    backgroundColor={"grays.8"}
                                    style={{
                                        width: "1px",
                                        height: "100%",
                                        margin: "auto",
                                        borderLeft: "2px solid black",
                                        borderRight: "2px solid black",
                                        boxSizing: "content-box",
                                        pointerEvents: "none",
                                    }}
                                />
                            </motion.div>
                        </Box>
                    </Box>

                    <HStack gridArea={"mode"} py={2}>
                        <PanelButton
                            tone={snap.mode === "slider" ? "selected" : "none"}
                            onClick={() => {
                                state.mode = "slider"
                            }}
                        >
                            Slider
                        </PanelButton>
                        <PanelButton
                            tone={snap.mode === "alt" ? "selected" : "none"}
                            onClick={() => {
                                state.mode = "alt"
                            }}
                        >
                            Alternate
                        </PanelButton>
                        <PanelButton
                            tone={snap.mode === "sbs" ? "selected" : "none"}
                            onClick={() => {
                                state.mode = "sbs"
                            }}
                        >
                            Side by Side
                        </PanelButton>
                    </HStack>
                    <ShiftHint snap={snap} gridArea={"hint"} />
                    {snap.mode === "slider" && (
                        <HStack gridArea={"opts"}>
                            <PanelSectionHeader>Effect</PanelSectionHeader>
                            <PanelButton
                                tone={sliderTrail === "none" ? sliderButtonTone : "none"}
                                onClick={() => {
                                    state.sliderTrail = "none"
                                    state.canvasContents = "none"
                                    if (!canvasRef.current) return
                                    const ctx = canvasRef.current.getContext("2d")
                                    ctx?.clearRect(
                                        0,
                                        0,
                                        canvasRef.current.width,
                                        canvasRef.current.height,
                                    )
                                }}
                            >
                                None
                            </PanelButton>
                            <PanelButton
                                tone={sliderTrail === "brightness" ? sliderButtonTone : "none"}
                                onClick={() => {
                                    drawComparison("brightness")
                                }}
                            >
                                Brightness
                            </PanelButton>
                            <PanelButton
                                tone={sliderTrail === "color" ? sliderButtonTone : "none"}
                                onClick={() => {
                                    drawComparison("color")
                                }}
                            >
                                Color
                            </PanelButton>
                            <PanelButton
                                tone={sliderTrail === "difference" ? sliderButtonTone : "none"}
                                onClick={() => {
                                    drawComparison("difference")
                                }}
                            >
                                Difference
                            </PanelButton>
                        </HStack>
                    )}
                    {snap.mode === "alt" && (
                        <HStack gridArea={"opts"}>
                            <Grid
                                gridTemplateAreas={"button"}
                                transformStyle={"preserve-3d"}
                                perspectiveOrigin={"80px"}
                            >
                                <PanelButton gridArea={"button"}>A</PanelButton>
                                <PanelButton
                                    gridArea={"button"}
                                    className={"blink-anim"}
                                    style={{
                                        ...ALT_ANIM_STYLE,
                                    }}
                                >
                                    B
                                </PanelButton>
                            </Grid>
                            Slower
                            <Slider
                                minWidth={"10rem"}
                                min={0}
                                max={10}
                                value={[snap.altSpeedInput]}
                                onValueChange={(value) => {
                                    state.altSpeedInput = value.value[0]
                                    if (value.value[0] !== 0) state.altSpeed = value.value[0]
                                }}
                                mx={1}
                            />
                            Faster
                        </HStack>
                    )}
                    {snap.mode === "sbs" && (
                        <HStack gridArea={"opts"}>
                            <PanelSectionHeader>Layout</PanelSectionHeader>
                            <PanelButton
                                tone={snap.sbsLayout === "horizontal" ? "selected" : "none"}
                                onClick={() => {
                                    state.sbsLayout = "horizontal"
                                }}
                            >
                                Horizontal
                            </PanelButton>
                            <PanelButton
                                tone={snap.sbsLayout === "vertical" ? "selected" : "none"}
                                onClick={() => {
                                    state.sbsLayout = "vertical"
                                }}
                            >
                                Vertical
                            </PanelButton>
                        </HStack>
                    )}
                </Grid>
            </Panel>
        </Flex>
    )
}

function getSliderTrailAndTone(snap: ImageCompareState): [SliderEffect, "info" | "selected"] {
    const tone = snap.shiftHeld ? "info" : "selected"
    if (snap.shiftHeld) {
        if (snap.sliderTrail === "none") return [snap.canvasContents, tone]
        return ["none", tone]
    }
    return [snap.sliderTrail, tone]
}

/**
 * Returns the text to use in the last part of the shift hint.
 * Assumes the text uses this template:
 * - Hold Shift to [do this thing]
 * - Release Shift to [do this thing]
 *
 * Return value will contain the [do this thing] text or null if no hint should
 * be displayed
 */
function getShiftText(snap: ImageCompareState): string | null {
    if (snap.mode === "slider") {
        if (!snap.sliderDragging) return null
        // trail effect is active
        if (snap.sliderTrail !== "none") {
            if (snap.shiftHeld) return "show trail effect"
            return "hide trail effect"
        }
        // trail effect is disabled but loaded
        if (snap.canvasContents !== "none") {
            if (snap.shiftHeld) return "hide trail effect"
            return "show trail effect"
        }
        // no effect is loaded
        return null
    }
    if (snap.mode === "alt") {
        // animation is active
        if (snap.altSpeedInput !== 0) {
            if (snap.shiftHeld) return "resume animation"
            return "pause animation"
        }
        // animation is disabled
        else {
            return "switch image"
        }
    }
    return null
}

interface ShiftHintProps extends ChakraProps {
    snap: Snapshot<ImageCompareState>
}
function ShiftHint(props: ShiftHintProps) {
    const { snap, ...rest } = props

    const verb = snap.shiftHeld ? "Release" : "Hold"
    const text = getShiftText(snap)
    if (!text) return null
    return (
        <Box alignSelf={"center"} justifySelf={"center"} {...rest}>
            {verb}
            <Kbd>Shift</Kbd>
            to {text}
        </Box>
    )
}

export default ImageCompare
