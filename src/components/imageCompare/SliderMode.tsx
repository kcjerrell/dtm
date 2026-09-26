import { Box, HoverCard, HStack, VStack } from "@chakra-ui/react"
import { useDebounceFn } from "ahooks"
import { motion } from "motion/react"
import { useCallback, useEffect, useMemo } from "react"
import { FaToggleOff } from "react-icons/fa"
import { ImBrightnessContrast } from "react-icons/im"
import { IoInvertMode } from "react-icons/io5"
import { MdOutlineColorLens } from "react-icons/md"
import { TbAdjustmentsHorizontal } from "react-icons/tb"
import { TfiSplitH } from "react-icons/tfi"
import type { Snapshot } from "valtio"
import { PanelSectionHeader } from "@/components/common"
import { Slider } from "@/components/ui/slider"
import IconButton from "../IconButton"
import { compareBrightness, compareColor, compareDifference } from "./CompareImages"
import {
    type ImageCompareHooksContextType,
    type ImageCompareMode,
    type ModeButtonProps,
    type ModeSettingProps,
    type ModeViewProps,
    type UseModeResult,
    useImageCompareHooks,
} from "./hooks"
import { ImageCompareContext, type ImageCompareState, type SliderEffect } from "./state"

interface ViewportCanvasGeometry {
    contentLeft: number
    contentTop: number
    contentWidth: number
    contentHeight: number
    viewportWidth: number
    viewportHeight: number
    pixelRatio: number
}

interface SliderModeProps {
    sliderTrail: SliderEffect
    sliderButtonTone: "info" | "selected"
    showWholeEffect: boolean
    copyComparisonBuffer: (effect?: SliderEffect) => void
    drawComparison: (effect: Exclude<SliderEffect, "none">, selectEffect?: boolean) => void
    updateEffectParam: () => void
}

interface SliderModeResult extends UseModeResult<SliderModeProps> {
    selfProps: SliderModeProps
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

function useMode(
    state: ImageCompareState,
    snap: Snapshot<ImageCompareState>,
    hooks: ImageCompareHooksContextType,
): SliderModeResult {
    const { refs, zoomStyle } = hooks
    const contentSize = snap.contentSize
    const contentOffset = snap.contentOffset

    const [sliderTrail, sliderButtonTone] = getSliderTrailAndTone(snap)
    const showWholeEffect =
        snap.mode === "slider" && snap.shiftHeld && !snap.sliderDragging && sliderTrail !== "none"

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

    const drawComparison = useCallback(
        (effect: Exclude<SliderEffect, "none">, selectEffect = true) => {
            if (selectEffect) state.sliderTrail = effect
            if (!refs.imgARef.current || !refs.imgBRef.current) return

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

    const selfProps = useMemo(
        () => ({
            sliderTrail,
            sliderButtonTone,
            showWholeEffect,
            copyComparisonBuffer,
            drawComparison,
            updateEffectParam,
        }),
        [
            copyComparisonBuffer,
            drawComparison,
            showWholeEffect,
            sliderButtonTone,
            sliderTrail,
            updateEffectParam,
        ],
    )

    return { selfProps }
}

function View(props: ModeViewProps<SliderModeProps>) {
    const { containerStyle, selfProps } = props
    const [state, snap] = ImageCompareContext.useContext()
    const { refs, mv } = useImageCompareHooks()
    if (!selfProps) return null

    const { showWholeEffect, sliderTrail } = selfProps

    return (
        <>
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
                <motion.div style={containerStyle}>
                    <motion.img
                        id="img-b-slider"
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
                        onLoad={(event) => {
                            state.imageBWidth = event.currentTarget.naturalWidth
                            state.imageBHeight = event.currentTarget.naturalHeight
                        }}
                    />
                </motion.div>
            </motion.div>

            <motion.canvas
                id="image-compare-canvas"
                ref={refs.normalCanvasRef}
                style={{
                    display:
                        snap.mode === "slider" && sliderTrail !== "none" && !showWholeEffect
                            ? "block"
                            : "none",
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    zIndex: 2,
                    pointerEvents: "none",
                    maskImage: mv.normalCanvasMaskMv,
                    WebkitMaskImage: mv.normalCanvasMaskMv,
                    maskRepeat: "no-repeat",
                    WebkitMaskRepeat: "no-repeat",
                    mixBlendMode: "normal",
                }}
            />

            <motion.canvas
                id="image-compare-canvas-inverted"
                ref={refs.invertedCanvasRef}
                style={{
                    display: snap.mode === "slider" && sliderTrail !== "none" ? "block" : "none",
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    zIndex: 2,
                    pointerEvents: "none",
                    filter: showWholeEffect || sliderTrail === "difference" ? "none" : "invert(1)",
                    maskImage: showWholeEffect ? "none" : mv.invertedCanvasMaskMv,
                    WebkitMaskImage: showWholeEffect ? "none" : mv.invertedCanvasMaskMv,
                    maskRepeat: "no-repeat",
                    WebkitMaskRepeat: "no-repeat",
                    mixBlendMode: "normal",
                }}
            />

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
                                (dividerRect.x - viewportRect.x + dividerRect.width / 2) /
                                    viewportRect.width,
                                0,
                            ),
                            1,
                        )
                        mv.sliderMv.set(nextSliderPosition)
                    }}
                >
                    <Box
                        backgroundColor="grays.8"
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
        </>
    )
}

function Settings(props: ModeSettingProps<SliderModeProps>) {
    const { selfProps, ...restProps } = props
    const [state, snap] = ImageCompareContext.useContext()
    if (snap.mode !== "slider" || !selfProps) return null

    const {
        copyComparisonBuffer,
        drawComparison,
        sliderButtonTone,
        sliderTrail,
        updateEffectParam,
    } = selfProps

    return (
        <HStack {...restProps}>
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
                onClick={() => drawComparison("brightness")}
            >
                <ImBrightnessContrast />
            </IconButton>
            <IconButton
                tone={sliderTrail === "color" ? sliderButtonTone : "none"}
                onClick={() => drawComparison("color")}
            >
                <MdOutlineColorLens />
            </IconButton>
            <IconButton
                tone={sliderTrail === "difference" ? sliderButtonTone : "none"}
                onClick={() => drawComparison("difference")}
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
                                minWidth="10rem"
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
                            <PanelSectionHeader>Gain</PanelSectionHeader>
                            <Slider
                                minWidth="10rem"
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
                        </VStack>
                    </HoverCard.Content>
                </HoverCard.Positioner>
            </HoverCard.Root>
        </HStack>
    )
}

function Button(props: ModeButtonProps) {
    const { selected, ...restProps } = props
    return (
        <IconButton tone={selected ? "selected" : "none"} {...restProps}>
            <TfiSplitH />
        </IconButton>
    )
}

function getSliderTrailAndTone(
    snap: Snapshot<ImageCompareState>,
): [SliderEffect, "info" | "selected"] {
    const tone = snap.shiftHeld ? "info" : "selected"
    if (snap.shiftHeld) {
        if (!snap.sliderDragging) return [snap.canvasContents, tone]
        if (snap.sliderTrail === "none") return [snap.canvasContents, tone]
        return ["none", tone]
    }
    return [snap.sliderTrail, tone]
}

export default {
    name: "slider",
    View,
    Button,
    Settings,
    useMode,
} satisfies ImageCompareMode<SliderModeProps>
