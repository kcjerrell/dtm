import { Box, Flex, Grid, HStack, Kbd, VStack } from "@chakra-ui/react"
import { useDebounceFn } from "ahooks"
import { motion, type SpringOptions, useMotionValue, useSpring, useTransform } from "motion/react"
import { type CSSProperties, useCallback, useEffect, useMemo, useRef } from "react"
import type { Snapshot } from "valtio"
import { Panel } from "@/components"
import { PanelButton, PanelSectionHeader } from "@/components/common"
import { useZoomable } from "@/components/preview/useZoomable"
import { Slider } from "@/components/ui/slider"
import { useProxyRef } from "@/hooks/valtioHooks"
import { compareBrightness, compareColor, compareDifference } from "../components/imageCompare/CompareImages"

const TRAIL_SPRING = {
    stiffness: 20,
    damping: 10,
    mass: 1,
    restDelta: 0.0005,
} as SpringOptions
const MAX_TRAIL_LENGTH = 0.3
const TRAIL_FEATHER_WIDTH = 0.08
const MIN_VISIBLE_TRAIL_LENGTH = 0.002
const TRANSPARENT_MASK = "linear-gradient(to right, transparent, transparent)"

const ALT_ANIM_STYLE = {
    animationDuration: "var(--alt-duration)",
    animationPlayState: "var(--alt-state)",
    animationDelay: "calc(var(--alt-duration) * var(--alt-phase) * -1)",
} as CSSProperties

const TEST_PATH_ROOT =
    "asset://localhost//Users/kcjer/Library/Application Support/com.kcjer.dtm/dev_images/"
const TEST_IMAGES = [
    "38dzby284dv6.png",
    "vm0kgvlpyklm.jpg",
    "bhdlwrwhdnd9.png",
    "cf68acpkwowm.png",
].map((n) => TEST_PATH_ROOT + n)
const [TEST_IMG_A, TEST_IMG_B] = [TEST_IMAGES[2], TEST_IMAGES[3]]

type SliderEffect = "brightness" | "color" | "difference" | "none"
type SbsLayout = "horizontal" | "vertical"

type ImageCompareState = {
    /** The active comparison mode: slider, alternate, or side-by-side */
    mode: "slider" | "alt" | "sbs"
    /** The selected slider trail effect */
    sliderTrail: SliderEffect
    /** The slider trail effect currently stored in the canvas */
    canvasContents: SliderEffect
    /** minimum perceptual difference shown by the slider effect */
    sliderThreshold: number
    /** multiplier applied to perceptual differences above the threshold */
    sliderGain: number
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
    viewportPixelRatio: number
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

type TrailDirection = "right" | "left"

function trailMask(sliderPosition: number, trailingPosition: number, direction: TrailDirection) {
    const distance = sliderPosition - trailingPosition
    if (
        Math.abs(distance) < MIN_VISIBLE_TRAIL_LENGTH ||
        (direction === "right" ? distance < 0 : distance > 0)
    ) {
        return TRANSPARENT_MASK
    }

    const slider = Math.min(Math.max(sliderPosition, 0), 1)
    const trailing = Math.min(Math.max(trailingPosition, 0), 1)

    if (direction === "right") {
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

interface ViewportCanvasGeometry {
    contentLeft: number
    contentTop: number
    contentWidth: number
    contentHeight: number
    viewportWidth: number
    viewportHeight: number
    pixelRatio: number
}

function drawComparisonRegion(
    source: HTMLCanvasElement | null,
    target: HTMLCanvasElement | null,
    geometry: ViewportCanvasGeometry,
) {
    if (!target) return

    const pixelWidth = Math.max(1, Math.round(geometry.viewportWidth * geometry.pixelRatio))
    const pixelHeight = Math.max(1, Math.round(geometry.viewportHeight * geometry.pixelRatio))
    if (target.width !== pixelWidth) target.width = pixelWidth
    if (target.height !== pixelHeight) target.height = pixelHeight

    const context = target.getContext("2d")
    if (!context) return

    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, pixelWidth, pixelHeight)

    if (!source?.width || !source.height || !geometry.contentWidth || !geometry.contentHeight) {
        return
    }

    const visibleLeft = Math.max(0, geometry.contentLeft)
    const visibleTop = Math.max(0, geometry.contentTop)
    const visibleRight = Math.min(
        geometry.viewportWidth,
        geometry.contentLeft + geometry.contentWidth,
    )
    const visibleBottom = Math.min(
        geometry.viewportHeight,
        geometry.contentTop + geometry.contentHeight,
    )
    const visibleWidth = visibleRight - visibleLeft
    const visibleHeight = visibleBottom - visibleTop
    if (visibleWidth <= 0 || visibleHeight <= 0) return

    const sourceX = ((visibleLeft - geometry.contentLeft) / geometry.contentWidth) * source.width
    const sourceY = ((visibleTop - geometry.contentTop) / geometry.contentHeight) * source.height
    const sourceWidth = (visibleWidth / geometry.contentWidth) * source.width
    const sourceHeight = (visibleHeight / geometry.contentHeight) * source.height

    context.imageSmoothingEnabled = false
    context.setTransform(geometry.pixelRatio, 0, 0, geometry.pixelRatio, 0, 0)
    context.drawImage(
        source,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        visibleLeft,
        visibleTop,
        visibleWidth,
        visibleHeight,
    )
}

function ImageCompare() {
    const { state, snap } = useProxyRef<ImageCompareState>(() => ({
        mode: "slider",
        sliderTrail: "none",
        sliderDragging: false,
        canvasContents: "none",
        sliderThreshold: 0.02,
        sliderGain: 10,
        shiftHeld: false,
        altSpeedInput: 5,
        altSpeed: 5,
        altPhase: 0.0,
        sbsLayout: "horizontal",
        viewportWidth: 0,
        viewportHeight: 0,
        viewportPixelRatio: 1,
        imageAWidth: 0,
        imageAHeight: 0,
        imageBWidth: 0,
        imageBHeight: 0,
    }))

    // the actual sliderTrail mode depends on shiftHeld
    const [sliderTrail, sliderButtonTone] = getSliderTrailAndTone(snap)
    const showWholeEffect =
        snap.mode === "slider" && snap.shiftHeld && !snap.sliderDragging && sliderTrail !== "none"

    const imgARef = useRef<HTMLImageElement>(null)
    const imgBRef = useRef<HTMLImageElement>(null)
    const offscreenCanvasRef = useRef<HTMLCanvasElement>(null)
    const normalCanvasRef = useRef<HTMLCanvasElement>(null)
    const invertedCanvasRef = useRef<HTMLCanvasElement>(null)
    const viewportRef = useRef<HTMLDivElement>(null)
    const sbsPaneARef = useRef<HTMLDivElement>(null)
    const sbsPaneBRef = useRef<HTMLDivElement>(null)
    const dragRef = useRef<HTMLDivElement>(null)

    const contentWidth = Math.max(snap.imageAWidth, snap.imageBWidth)
    const contentHeight = Math.max(snap.imageAHeight, snap.imageBHeight)
    const viewportContentSize = useMemo(
        () => containSize(contentWidth, contentHeight, snap.viewportWidth, snap.viewportHeight),
        [contentHeight, contentWidth, snap.viewportHeight, snap.viewportWidth],
    )
    const sbsViewportSize = useMemo(
        () => ({
            width: snap.viewportWidth / (snap.sbsLayout === "horizontal" ? 2 : 1),
            height: snap.viewportHeight / (snap.sbsLayout === "vertical" ? 2 : 1),
        }),
        [snap.sbsLayout, snap.viewportHeight, snap.viewportWidth],
    )
    const sbsContentSize = useMemo(
        () =>
            containSize(contentWidth, contentHeight, sbsViewportSize.width, sbsViewportSize.height),
        [contentHeight, contentWidth, sbsViewportSize.height, sbsViewportSize.width],
    )
    const contentSize = snap.mode === "sbs" ? sbsContentSize : viewportContentSize
    const contentViewportSize =
        snap.mode === "sbs"
            ? sbsViewportSize
            : { width: snap.viewportWidth, height: snap.viewportHeight }
    const contentLeft = (contentViewportSize.width - contentSize.width) / 2
    const contentTop = (contentViewportSize.height - contentSize.height) / 2
    const imageAWidth = contentWidth ? `${(snap.imageAWidth / contentWidth) * 100}%` : "0%"
    const imageAHeight = contentHeight ? `${(snap.imageAHeight / contentHeight) * 100}%` : "0%"
    const imageBWidth = contentWidth ? `${(snap.imageBWidth / contentWidth) * 100}%` : "0%"
    const imageBHeight = contentHeight ? `${(snap.imageBHeight / contentHeight) * 100}%` : "0%"
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
        zoomViewportRef: snap.mode === "sbs" ? sbsPaneARef : undefined,
        mapZoomPoint: snap.mode === "sbs" ? mapSbsZoomPoint : undefined,
        maxZoom: 16,
    })

    const sliderMv = useMotionValue(0.5)
    const dividerXMv = useMotionValue(0)
    const clipMv = useTransform(sliderMv, (value) => `inset(0 0 0 ${value * 100}%)`)
    const trailingMv = useSpring(sliderMv, TRAIL_SPRING)
    const normalCanvasMaskMv = useTransform<number, string>(
        [sliderMv, trailingMv],
        ([slider, trailing]) => trailMask(slider, trailing, "right"),
    )
    const invertedCanvasMaskMv = useTransform<number, string>(
        [sliderMv, trailingMv],
        ([slider, trailing]) => trailMask(slider, trailing, "left"),
    )

    const altAnimationDuration = `${3 / snap.altSpeed}s`
    const altAnimationState = snap.shiftHeld || snap.altSpeedInput === 0 ? "paused" : "running"
    const altPhase = ((snap.shiftHeld && snap.altSpeedInput === 0 ? 0.5 : 0) + snap.altPhase) % 1

    const copyComparisonBuffer = useCallback(
        (effect: SliderEffect = state.canvasContents) => {
            if (
                effect !== "none" &&
                (zoomStyle.x.isAnimating() ||
                    zoomStyle.y.isAnimating() ||
                    zoomStyle.scale.isAnimating())
            ) {
                return
            }

            const scale = zoomStyle.scale.get()
            const scaledWidth = contentSize.width * scale
            const scaledHeight = contentSize.height * scale
            const geometry = {
                contentLeft:
                    contentLeft + zoomStyle.x.get() + (contentSize.width - scaledWidth) / 2,
                contentTop:
                    contentTop + zoomStyle.y.get() + (contentSize.height - scaledHeight) / 2,
                contentWidth: scaledWidth,
                contentHeight: scaledHeight,
                viewportWidth: snap.viewportWidth,
                viewportHeight: snap.viewportHeight,
                pixelRatio: snap.viewportPixelRatio,
            }
            const source = effect === "none" ? null : offscreenCanvasRef.current

            drawComparisonRegion(source, normalCanvasRef.current, geometry)
            drawComparisonRegion(source, invertedCanvasRef.current, geometry)
        },
        [
            contentLeft,
            contentSize.height,
            contentSize.width,
            contentTop,
            snap.viewportHeight,
            snap.viewportPixelRatio,
            snap.viewportWidth,
            state,
            zoomStyle.scale,
            zoomStyle.x,
            zoomStyle.y,
        ],
    )

    const onLoad = useCallback(
        (img: "a" | "b", element: HTMLImageElement) => {
            if (img === "a") {
                state.imageAWidth = element.naturalWidth
                state.imageAHeight = element.naturalHeight
            } else {
                state.imageBWidth = element.naturalWidth
                state.imageBHeight = element.naturalHeight
            }
        },
        [state],
    )

    const drawComparison = useCallback(
        (effect: Exclude<SliderEffect, "none">, selectEffect = true) => {
            if (selectEffect) state.sliderTrail = effect
            if (!imgARef.current || !imgBRef.current) return

            // Keep the native-resolution comparison buffer detached from the viewport DOM.
            const offscreenCanvas = offscreenCanvasRef.current ?? document.createElement("canvas")
            offscreenCanvasRef.current = offscreenCanvas

            try {
                if (effect === "brightness") {
                    compareBrightness(imgARef.current, imgBRef.current, offscreenCanvas, {
                        gain: state.sliderGain,
                        threshold: state.sliderThreshold,
                    })
                } else if (effect === "color") {
                    compareColor(imgARef.current, imgBRef.current, offscreenCanvas, {
                        gain: state.sliderGain,
                        threshold: state.sliderThreshold,
                    })
                } else {
                    compareDifference(imgARef.current, imgBRef.current, offscreenCanvas, {
                        gain: state.sliderGain,
                        threshold: state.sliderThreshold,
                    })
                }
                state.canvasContents = effect
                copyComparisonBuffer(effect)
            } catch (error) {
                console.error(error)
            }
        },
        [copyComparisonBuffer, state],
    )

    const { run: updateEffectParam } = useDebounceFn(
        () => {
            if (state.sliderTrail !== "none") drawComparison(state.sliderTrail, false)
        },
        { wait: 500 },
    )

    useEffect(() => {
        let animationFrame: number | undefined
        // Leave the viewport canvases untouched while the image is moving, then refresh once the
        // last transform spring settles.
        const copyAfterTransformSettles = () => {
            if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
            animationFrame = requestAnimationFrame(() => {
                animationFrame = undefined
                copyComparisonBuffer()
            })
        }
        const unsubscribeX = zoomStyle.x.on("animationComplete", copyAfterTransformSettles)
        const unsubscribeY = zoomStyle.y.on("animationComplete", copyAfterTransformSettles)
        const unsubscribeScale = zoomStyle.scale.on("animationComplete", copyAfterTransformSettles)

        return () => {
            if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
            unsubscribeX()
            unsubscribeY()
            unsubscribeScale()
        }
    }, [copyComparisonBuffer, zoomStyle.scale, zoomStyle.x, zoomStyle.y])

    useEffect(() => {
        copyComparisonBuffer()
    }, [copyComparisonBuffer])

    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        const updateSize = () => {
            const width = viewport.clientWidth
            state.viewportWidth = width
            state.viewportHeight = viewport.clientHeight
            state.viewportPixelRatio = window.devicePixelRatio || 1
            dividerXMv.set((sliderMv.get() - 0.5) * width)
        }
        const observer = new ResizeObserver(updateSize)
        observer.observe(viewport)
        window.addEventListener("resize", updateSize)
        updateSize()

        return () => {
            observer.disconnect()
            window.removeEventListener("resize", updateSize)
        }
    }, [dividerXMv, sliderMv, state])

    useEffect(() => {
        const keydown = (e: KeyboardEvent) => {
            if (e.key === "Shift") {
                state.shiftHeld = true
            } else if (e.code === "Space") {
                if (state.mode === "alt") {
                    if (state.altSpeedInput === 0) state.altSpeedInput = state.altSpeed
                    else state.altSpeedInput = 0
                } else if (state.mode === "slider") {
                    if (state.sliderTrail === "none") drawComparison("brightness")
                    else if (state.sliderTrail === "brightness") drawComparison("color")
                    else if (state.sliderTrail === "color") drawComparison("difference")
                    else {
                        state.sliderTrail = "none"
                        state.canvasContents = "none"
                        copyComparisonBuffer("none")
                    }
                } else if (state.mode === "sbs") {
                    state.sbsLayout = state.sbsLayout === "horizontal" ? "vertical" : "horizontal"
                }
            } else if (e.code === "Tab") {
                e.preventDefault()
                state.mode =
                    state.mode === "slider" ? "alt" : state.mode === "alt" ? "sbs" : "slider"
            }
        }
        const keyup = (e: KeyboardEvent) => {
            if (e.key === "Shift") {
                state.shiftHeld = false
            }
        }
        document.addEventListener("keydown", keydown)
        document.addEventListener("keyup", keyup)

        return () => {
            document.removeEventListener("keydown", keydown)
            document.removeEventListener("keyup", keyup)
        }
    }, [state, copyComparisonBuffer, drawComparison])

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
                        <motion.canvas
                            id="image-compare-canvas"
                            ref={normalCanvasRef}
                            style={{
                                display:
                                    snap.mode === "slider" &&
                                    sliderTrail !== "none" &&
                                    !showWholeEffect
                                        ? "block"
                                        : "none",
                                position: "absolute",
                                inset: 0,
                                width: "100%",
                                height: "100%",
                                zIndex: 2,
                                pointerEvents: "none",
                                filter: sliderTrail === "difference" ? "none" : "invert(1)",
                                maskImage: normalCanvasMaskMv,
                                WebkitMaskImage: normalCanvasMaskMv,
                                maskRepeat: "no-repeat",
                                WebkitMaskRepeat: "no-repeat",
                            }}
                        />
                        <motion.canvas
                            id="image-compare-canvas-inverted"
                            ref={invertedCanvasRef}
                            style={{
                                display:
                                    snap.mode === "slider" && sliderTrail !== "none"
                                        ? "block"
                                        : "none",
                                position: "absolute",
                                inset: 0,
                                width: "100%",
                                height: "100%",
                                zIndex: 2,
                                pointerEvents: "none",
                                maskImage: showWholeEffect ? "none" : invertedCanvasMaskMv,
                                WebkitMaskImage: showWholeEffect ? "none" : invertedCanvasMaskMv,
                                maskRepeat: "no-repeat",
                                WebkitMaskRepeat: "no-repeat",
                            }}
                        />
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
                                    const nextSliderPosition = Math.min(
                                        Math.max(
                                            (dividerRect.x -
                                                viewportRect.x +
                                                dividerRect.width / 2) /
                                                viewportRect.width,
                                            0,
                                        ),
                                        1,
                                    )
                                    sliderMv.set(nextSliderPosition)
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
                        <VStack gridArea={"opts"} alignItems={"stretch"}>
                            <HStack>
                                <PanelSectionHeader>Effect</PanelSectionHeader>
                                <PanelButton
                                    tone={sliderTrail === "none" ? sliderButtonTone : "none"}
                                    onClick={() => {
                                        state.sliderTrail = "none"
                                        state.canvasContents = "none"
                                        copyComparisonBuffer("none")
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
                            <HStack>
                                <PanelSectionHeader>Threshold</PanelSectionHeader>
                                <Slider
                                    minWidth={"10rem"}
                                    min={0}
                                    max={0.2}
                                    step={0.01}
                                    value={[snap.sliderThreshold]}
                                    onValueChange={(value) => {
                                        state.sliderThreshold = value.value[0]
                                        updateEffectParam()
                                    }}
                                    mx={1}
                                />
                                {/*<NumberInputRoot
                                    width={"6rem"}
                                    min={0}
                                    step={0.001}
                                    value={snap.sliderThreshold.toString()}
                                    onValueChange={(details) => {
                                        if (Number.isFinite(details.valueAsNumber)) {
                                            state.sliderThreshold = details.valueAsNumber
                                            if (state.canvasContents !== "none") {
                                                drawComparison(state.canvasContents, false)
                                            }
                                        }
                                    }}
                                >
                                    <NumberInputField aria-label={"Effect threshold"} />
                                </NumberInputRoot>*/}
                                <PanelSectionHeader>Gain</PanelSectionHeader>
                                <Slider
                                    minWidth={"10rem"}
                                    min={1}
                                    max={20}
                                    step={1}
                                    value={[snap.sliderGain]}
                                    onValueChange={(value) => {
                                        state.sliderGain = value.value[0]
                                        updateEffectParam()
                                    }}
                                    mx={1}
                                />
                                {/*<NumberInputRoot
                                    width={"6rem"}
                                    min={0}
                                    step={1}
                                    value={snap.sliderGain.toString()}
                                    onValueChange={(details) => {
                                        if (Number.isFinite(details.valueAsNumber)) {
                                            state.sliderGain = details.valueAsNumber
                                            if (state.canvasContents !== "none") {
                                                drawComparison(state.canvasContents, false)
                                            }
                                        }
                                    }}
                                >
                                    <NumberInputField aria-label={"Effect gain"} />
                                </NumberInputRoot>*/}
                            </HStack>
                        </VStack>
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
        if (!snap.sliderDragging) return [snap.canvasContents, tone]
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
        if (!snap.sliderDragging) {
            if (snap.canvasContents === "none") return null
            if (snap.shiftHeld) return "hide whole effect"
            return "show whole effect"
        }
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
