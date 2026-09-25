import {
    Box,
    chakra,
    createListCollection,
    Grid,
    HoverCard,
    HStack,
    Kbd,
    VStack,
} from "@chakra-ui/react"
import { useDebounceFn } from "ahooks"
import { MotionStyle, motion } from "motion/react"
import { Activity, type CSSProperties, useCallback, useEffect, useMemo } from "react"
import { FaToggleOff } from "react-icons/fa"
import { ImBrightnessContrast } from "react-icons/im"
import { IoInvertMode } from "react-icons/io5"
import { MdOutlineColorLens } from "react-icons/md"
import { PiRepeatBold } from "react-icons/pi"
import { RiLayoutColumnFill } from "react-icons/ri"
import { TfiSplitH } from "react-icons/tfi"
import type { Snapshot } from "valtio"
import { PanelButton, PanelSectionHeader } from "@/components/common"
import { useZoomable } from "@/components/preview/useZoomable"
import {
    SelectContent,
    SelectItem,
    SelectRoot,
    SelectTrigger,
    SelectValueText,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import IconButton from "../IconButton"
import AltMode from "./AltMode"
import { compareBrightness, compareColor, compareDifference } from "./CompareImages"
import { useCreateImageCompareContext } from "./hooks"
import { ImageCompareContext, ImageCompareState, SliderEffect } from "./state"
import { TbAdjustmentsHorizontal } from "react-icons/tb"
import { LuStretchHorizontal, LuStretchVertical } from "react-icons/lu"

export type TrailDirection = "right" | "left"

const comparisonModeCollection = createListCollection({
    items: [
        { value: "slider", label: "Slider" },
        { value: "alt", label: "Alternate" },
        { value: "sbs", label: "Side by Side" },
    ],
})

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

export interface ImageCompareProps extends ChakraProps {
    a: string
    b: string
}

function ImageCompare(props: ImageCompareProps) {
    const { ...restProps } = props
    const [Provider, state, snap] = ImageCompareContext.useCreate(props)
    const [HooksProvider, hooks] = useCreateImageCompareContext()
    const { refs, mv } = hooks

    // the actual sliderTrail mode depends on shiftHeld
    const [sliderTrail, sliderButtonTone] = getSliderTrailAndTone(snap)
    const showWholeEffect =
        snap.mode === "slider" && snap.shiftHeld && !snap.sliderDragging && sliderTrail !== "none"

    // element refs were here

    const contentSize = snap.contentSize
    const contentOffset = snap.contentOffset

    const altMode = AltMode.useMode(state, snap, hooks)

    const modes = [[AltMode, altMode]] as const

    const activeMode = snap.mode === "alt" ? altMode : {}

    // const sbsViewportSize = useMemo(
    //     () => ({
    //         width: snap.viewportWidth / (snap.sbsLayout === "horizontal" ? 2 : 1),
    //         height: snap.viewportHeight / (snap.sbsLayout === "vertical" ? 2 : 1),
    //     }),
    //     [snap.sbsLayout, snap.viewportHeight, snap.viewportWidth],
    // )
    // const sbsContentSize = useMemo(
    //     () =>
    //         containSize(contentWidth, contentHeight, sbsViewportSize.width, sbsViewportSize.height),
    //     [contentHeight, contentWidth, sbsViewportSize.height, sbsViewportSize.width],
    // )
    // const contentSize = snap.mode === "sbs" ? sbsContentSize : viewportContentSize
    // const contentViewportSize =
    //     snap.mode === "sbs"
    //         ? sbsViewportSize
    //         : { width: snap.viewportWidth, height: snap.viewportHeight }

    //     const mapSbsZoomPoint = useCallback(
    //         (clientX: number, clientY: number) => {
    //             const paneA = refs.sbsPaneARef.current?.getBoundingClientRect()
    //             const paneB = refs.sbsPaneBRef.current?.getBoundingClientRect()
    //
    //             if (
    //                 paneA &&
    //                 paneB &&
    //                 clientX >= paneB.left &&
    //                 clientX <= paneB.right &&
    //                 clientY >= paneB.top &&
    //                 clientY <= paneB.bottom
    //             ) {
    //                 return {
    //                     clientX: paneA.left + ((clientX - paneB.left) / paneB.width) * paneA.width,
    //                     clientY: paneA.top + ((clientY - paneB.top) / paneB.height) * paneA.height,
    //                 }
    //             }
    //             return { clientX, clientY }
    //         },
    //         [refs],
    //     )

    const { handlers: zoomHandlers, style: zoomStyle } = useZoomable(refs.viewportRef, {
        contentSize,
        contentOffset,
        // viewportSize: snap.mode === "sbs" ? sbsViewportSize : undefined,
        // zoomViewportRef: snap.mode === "sbs" ? refs.sbsPaneARef : undefined,
        // mapZoomPoint: snap.mode === "sbs" ? mapSbsZoomPoint : undefined,
        maxZoom: 16,
    })
    const imageContainerStyle: MotionStyle = useMemo(
        () => ({
            ...zoomStyle,
            position: "absolute",
            left: contentOffset.left,
            top: contentOffset.top,
            width: contentSize.width,
            height: contentSize.height,
            transformOrigin: "center center",
        }),
        [contentSize.height, contentSize.width, zoomStyle, contentOffset.left, contentOffset.top],
    )

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
                    contentOffset.left + zoomStyle.x.get() + (contentSize.width - scaledWidth) / 2,
                contentTop:
                    contentOffset.top + zoomStyle.y.get() + (contentSize.height - scaledHeight) / 2,
                contentWidth: scaledWidth,
                contentHeight: scaledHeight,
                viewportWidth: snap.viewportWidth,
                viewportHeight: snap.viewportHeight,
                pixelRatio: snap.viewportPixelRatio,
            }
            const source = effect === "none" ? null : refs.offscreenCanvasRef.current

            drawComparisonRegion(source, refs.normalCanvasRef.current, geometry)
            drawComparisonRegion(source, refs.invertedCanvasRef.current, geometry)
        },
        [
            contentOffset.left,
            contentOffset.top,
            contentSize.height,
            contentSize.width,
            snap.viewportHeight,
            snap.viewportPixelRatio,
            snap.viewportWidth,
            state,
            zoomStyle.scale,
            zoomStyle.x,
            zoomStyle.y,
            refs,
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
            if (!refs.imgARef.current || !refs.imgBRef.current) return

            // Keep the native-resolution comparison buffer detached from the viewport DOM.
            const offscreenCanvas =
                refs.offscreenCanvasRef.current ?? document.createElement("canvas")
            refs.offscreenCanvasRef.current = offscreenCanvas

            try {
                if (effect === "brightness") {
                    compareBrightness(refs.imgARef.current, refs.imgBRef.current, offscreenCanvas, {
                        gain: state.sliderGain,
                        threshold: state.sliderThreshold,
                    })
                } else if (effect === "color") {
                    compareColor(refs.imgARef.current, refs.imgBRef.current, offscreenCanvas, {
                        gain: state.sliderGain,
                        threshold: state.sliderThreshold,
                    })
                } else {
                    compareDifference(refs.imgARef.current, refs.imgBRef.current, offscreenCanvas, {
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
        [copyComparisonBuffer, state, refs],
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
        const viewport = refs.viewportRef.current
        if (!viewport) return

        const updateSize = () => {
            const width = viewport.clientWidth
            state.viewportWidth = width
            state.viewportHeight = viewport.clientHeight
            state.viewportPixelRatio = window.devicePixelRatio || 1
            mv.dividerXMv.set((mv.sliderMv.get() - 0.5) * width)
        }
        const observer = new ResizeObserver(updateSize)
        observer.observe(viewport)
        window.addEventListener("resize", updateSize)
        updateSize()

        return () => {
            observer.disconnect()
            window.removeEventListener("resize", updateSize)
        }
    }, [mv, state, refs])

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
        <HooksProvider>
            <Provider>
                <GridRoot
                    cursor={snap.sliderDragging ? "none" : undefined}
                    // defining anim duration on common parent
                    {...(activeMode.rootProps ?? {})}
                    {...restProps}
                >
                    {/* image viewport */}
                    <Box
                        ref={refs.viewportRef}
                        id="image-compare-viewport"
                        gridArea={"image"}
                        position={"relative"}
                        minWidth={0}
                        minHeight={0}
                        overflow={"hidden"}
                        touchAction={"none"}
                        // className={"check-bg"}
                        bgColor={"bg.1"}
                        boxShadow={"0px 0px 5px -1px #00000055, 0px 3px 12px -3px #00000055"}
                        {...zoomHandlers}
                    >
                        {/* image a base */}
                        <motion.div
                            id="image-compare-stage"
                            style={{
                                ...imageContainerStyle,
                                display: snap.mode === "sbs" ? "none" : "block",
                                imageRendering: "pixelated",
                            }}
                        >
                            <motion.img
                                id={"img-a"}
                                crossOrigin="anonymous"
                                ref={refs.imgARef}
                                draggable={false}
                                src={snap.imageASrc}
                                alt=""
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    width: "100%",
                                    height: "100%",
                                    pointerEvents: "none",
                                    imageRendering: "pixelated",
                                }}
                                onLoad={(event) => onLoad("a", event.currentTarget)}
                            />
                        </motion.div>

                        {/* image b for slider */}
                        <motion.div
                            style={{
                                display: snap.mode === "slider" ? "block" : "none",
                                position: "absolute",
                                inset: 0,
                                zIndex: 1,
                                clipPath: mv.clipMv,
                                pointerEvents: "none",
                            }}
                        >
                            <motion.div style={imageContainerStyle}>
                                <motion.img
                                    id={"img-b-slider"}
                                    crossOrigin="anonymous"
                                    ref={refs.imgBRef}
                                    draggable={false}
                                    src={snap.imageBSrc}
                                    alt=""
                                    style={{
                                        position: "absolute",
                                        inset: 0,
                                        width: "100%",
                                        height: "100%",
                                        imageRendering: "pixelated",
                                    }}
                                    onLoad={(event) => onLoad("b", event.currentTarget)}
                                />
                            </motion.div>
                        </motion.div>

                        {/* image b for alt */}
                        {modes.map(([Mode, value]) => (
                            <Mode.View
                                key={Mode.name}
                                containerStyle={imageContainerStyle}
                                selfProps={value.selfProps}
                            />
                        ))}

                        {/* sbs
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
                            ref={refs.sbsPaneARef}
                            style={{
                                flex: "1 1 0",
                                position: "relative",
                                minWidth: 0,
                                minHeight: 0,
                                overflow: "hidden",
                            }}
                        >
                            <motion.div style={imageContainerStyle}>
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
                            ref={refs.sbsPaneBRef}
                            style={{
                                flex: "1 1 0",
                                position: "relative",
                                minWidth: 0,
                                minHeight: 0,
                                overflow: "hidden",
                            }}
                        >
                            <motion.div style={imageContainerStyle}>
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
                    </motion.div> */}

                        {/* inverted canvas */}
                        <motion.canvas
                            id="image-compare-canvas"
                            ref={refs.normalCanvasRef}
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
                                maskImage: mv.normalCanvasMaskMv,
                                WebkitMaskImage: mv.normalCanvasMaskMv,
                                maskRepeat: "no-repeat",
                                WebkitMaskRepeat: "no-repeat",
                                mixBlendMode: "normal",
                            }}
                        />

                        {/* normal canvas */}
                        <motion.canvas
                            id="image-compare-canvas-inverted"
                            ref={refs.invertedCanvasRef}
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
                                maskImage: showWholeEffect ? "none" : mv.invertedCanvasMaskMv,
                                WebkitMaskImage: showWholeEffect ? "none" : mv.invertedCanvasMaskMv,
                                maskRepeat: "no-repeat",
                                WebkitMaskRepeat: "no-repeat",
                                mixBlendMode: "normal",
                            }}
                            animate={{
                                opacity: showWholeEffect ? 1 : 0,
                            }}
                            transition={{
                                opacity: {
                                    duration: 0.5,
                                },
                                maskImage: {},
                            }}
                        />

                        {/* slider divider */}
                        <Box
                            asChild
                            _hover={{ "& > *": { bgColor: "grays.12" } }}
                            cursor={snap.sliderDragging ? "none" : "ew-resize"}
                        >
                            <motion.div
                                id="image-compare-divider"
                                ref={refs.dragRef}
                                drag="x"
                                dragMomentum={false}
                                dragConstraints={refs.viewportRef}
                                dragElastic={0}
                                style={{
                                    display: snap.mode === "slider" ? "block" : "none",
                                    position: "absolute",
                                    width: "16px",
                                    height: "100%",
                                    left: "calc(50% - 8px)",
                                    top: 0,
                                    x: mv.dividerXMv,
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
                                    const divider = refs.dragRef.current
                                    const viewport = refs.viewportRef.current
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
                                    mv.sliderMv.set(nextSliderPosition)
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

                    {/* mode buttons */}
                    <HStack gridArea={"buttons"} px={8} py={2}>
                        <HStack
                            _after={{
                                content: '""',
                                bgColor: "gray",
                                width: "1px",
                                height: "1.75rem",
                                boxShadow: "lg",
                            }}
                        >
                            <PanelSectionHeader>Mode</PanelSectionHeader>
                            {modes.map(([Mode, _]) => (
                                <Mode.Button
                                    key={Mode.name}
                                    selected={snap.mode === Mode.name}
                                    onClick={() => {
                                        state.mode = Mode.name
                                    }}
                                />
                            ))}
                            <IconButton
                                tone={snap.mode === "slider" ? "selected" : "none"}
                                onClick={() => {
                                    state.mode = "slider"
                                }}
                            >
                                <TfiSplitH />
                            </IconButton>
                            <IconButton
                                tone={snap.mode === "sbs" ? "selected" : "none"}
                                onClick={() => {
                                    state.mode = "sbs"
                                }}
                            >
                                <RiLayoutColumnFill />
                            </IconButton>
                        </HStack>

                        {/* slider options */}
                        {snap.mode === "slider" && (
                            <HStack>
                                <PanelSectionHeader>Effect</PanelSectionHeader>
                                <IconButton
                                    tone={sliderTrail === "none" ? sliderButtonTone : "none"}
                                    onClick={() => {
                                        state.sliderTrail = "none"
                                        state.canvasContents = "none"
                                        copyComparisonBuffer("none")
                                    }}
                                >
                                    <FaToggleOff />
                                </IconButton>
                                <IconButton
                                    tone={sliderTrail === "brightness" ? sliderButtonTone : "none"}
                                    onClick={() => {
                                        drawComparison("brightness")
                                    }}
                                >
                                    <ImBrightnessContrast />
                                </IconButton>
                                <IconButton
                                    tone={sliderTrail === "color" ? sliderButtonTone : "none"}
                                    onClick={() => {
                                        drawComparison("color")
                                    }}
                                >
                                    <MdOutlineColorLens />
                                </IconButton>
                                <IconButton
                                    tone={sliderTrail === "difference" ? sliderButtonTone : "none"}
                                    onClick={() => {
                                        drawComparison("difference")
                                    }}
                                >
                                    <IoInvertMode />
                                </IconButton>

                                <HoverCard.Root openDelay={0} closeDelay={400}>
                                    <HoverCard.Trigger asChild>
                                        <IconButton>
                                            <TbAdjustmentsHorizontal />
                                        </IconButton>
                                    </HoverCard.Trigger>
                                    <HoverCard.Positioner>
                                        <HoverCard.Content>
                                            <HoverCard.Arrow>
                                                <HoverCard.ArrowTip />
                                            </HoverCard.Arrow>

                                            <VStack>
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
                                            </VStack>
                                        </HoverCard.Content>
                                    </HoverCard.Positioner>
                                </HoverCard.Root>
                            </HStack>
                        )}

                        {modes.map(([Mode, value]) => (
                            <Mode.Settings
                                key={Mode.name}
                                selfProps={value.selfProps}
                            />
                        ))}

                        {/* sbs layout buttons */}
                        {snap.mode === "sbs" && (
                            <HStack>
                                <PanelSectionHeader>Layout</PanelSectionHeader>
                                <IconButton
                                    tone={snap.sbsLayout === "horizontal" ? "selected" : "none"}
                                    onClick={() => {
                                        state.sbsLayout = "horizontal"
                                    }}
                                >
                                    <LuStretchHorizontal />
                                </IconButton>
                                <IconButton
                                    tone={snap.sbsLayout === "vertical" ? "selected" : "none"}
                                    onClick={() => {
                                        state.sbsLayout = "vertical"
                                    }}
                                >
                                    <LuStretchVertical />
                                </IconButton>
                            </HStack>
                        )}
                    </HStack>

                    {/* hint text */}
                    <ShiftHint snap={snap} gridArea={"hint"} justifySelf={"end"} py={2} px={8} />
                </GridRoot>
            </Provider>
        </HooksProvider>
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

const GridRoot = chakra("div", {
    base: {
        display: "grid",
        position: "relative",
        width: "full",
        height: "full",
        minWidth: 0,
        minHeight: 0,
        justifyContent: "stretch",
        alignItems: "stretch",
        gridTemplateColumns: "max-content 1fr",
        gridTemplateRows: "minmax(0, 1fr) min-content",
        gridTemplateAreas: '"image image" "buttons hint"',
        bgColor: "bg.2",
    },
})

export default ImageCompare
