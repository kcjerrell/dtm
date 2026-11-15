import { Box, HStack, Popover, Portal, VStack } from "@chakra-ui/react"
import { usePopoverContext } from "@chakra-ui/react/popover"
import { motion, useTransform } from "motion/react"
import {
    type ComponentProps,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useState,
} from "react"
import type { Snapshot } from "valtio"
import { subscribeKey } from "valtio/utils"
import { Panel, PanelSectionHeader } from "@/components/common"
import { Slider } from "@/components/ui/slider"
import { useRootElementRef } from "@/hooks/useRootElement"
import { useTimeout } from "@/hooks/useTimeout"
import ToolbarButton from "../toolbar/ToolbarButton"
import { ToolbarSection } from "../toolbar/ToolbarSection"
import {
    type ImageCompareHooksContextType,
    type ImageCompareMode,
    type ModeButtonProps,
    type ModeSettingProps,
    type ModeViewProps,
    type UseModeResult,
    useImageCompareHooks,
} from "./hooks"
import {
    BrightnessEffect,
    ColorEffect,
    DifferenceEffect,
    SliderCompare,
    SliderSettings,
} from "./icons"
import { getComparisonImageStyle } from "./imageGeometry"
import type { RasterSource } from "./raster"
import { transitionSliderEffectDisplay } from "./sliderEffectDisplay"
import { ImageCompareContext, type ImageCompareState, type SliderEffect } from "./state"
import { sliderRasterImageKey, useSliderComparison } from "./useSliderComparison"

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
    selectEffect: (effect: SliderEffect) => void
}

const NEXT_SLIDER_EFFECT: Record<SliderEffect, SliderEffect> = {
    none: "brightness",
    brightness: "color",
    color: "difference",
    difference: "none",
}

function clearViewportCanvases(
    normal: HTMLCanvasElement | null,
    inverted: HTMLCanvasElement | null,
) {
    for (const canvas of [normal, inverted]) {
        if (canvas) canvas.width = canvas.height = 0
    }
}

function drawComparisonRegion(
    source: RasterSource,
    target: HTMLCanvasElement | null,
    geometry: ViewportCanvasGeometry,
    smoothing: boolean,
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

    if (!source.width || !source.height || !geometry.contentWidth || !geometry.contentHeight) {
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

    context.imageSmoothingEnabled = smoothing
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
    _hooks: ImageCompareHooksContextType,
): UseModeResult<SliderModeProps> {
    useEffect(
        () =>
            subscribeKey(
                state,
                "shiftHeld",
                (shiftHeld) => {
                    state.sliderEffectDisplay = transitionSliderEffectDisplay(
                        state.sliderEffectDisplay,
                        shiftHeld ? "shiftDown" : "shiftUp",
                        state.sliderDragging,
                    )
                },
                true,
            ),
        [state],
    )

    const selectEffect = useCallback(
        (effect: SliderEffect) => {
            state.sliderTrail = effect
        },
        [state],
    )

    const keyHandlers = useMemo(
        () => ({
            space: () => {
                selectEffect(NEXT_SLIDER_EFFECT[state.sliderTrail])
            },
        }),
        [selectEffect, state],
    )

    const sliderTrail = snap.sliderTrail
    const selfProps = useMemo(() => ({ sliderTrail, selectEffect }), [selectEffect, sliderTrail])

    return { selfProps, keyHandlers }
}

function View(props: ModeViewProps<SliderModeProps>) {
    const { containerStyle } = props
    const [state, snap] = ImageCompareContext.useContext()
    const { refs, mv, zoomStyle } = useImageCompareHooks()
    const { offscreenCanvasRef, normalCanvasRef, invertedCanvasRef } = refs
    const { displayedEffect } = useSliderComparison(state, snap, refs)
    const leftOfSliderClipMv = useTransform(
        mv.sliderMv,
        (value) => `inset(0 ${(1 - value) * 100}% 0 0)`,
    )
    const effectDisplay = snap.sliderEffectDisplay
    const showEffect =
        snap.mode === "slider" && displayedEffect !== "none" && effectDisplay !== "hidden"

    const { width: contentWidth, height: contentHeight } = snap.contentSize
    const { left: contentLeft, top: contentTop } = snap.contentOffset
    const { viewportWidth, viewportHeight, viewportPixelRatio, smoothing } = snap
    const { x, y, scale } = zoomStyle

    // A retained raster may be reused, but its viewport copies need the current zoom.
    // Draw before revealing an overlay, then follow the existing full/trail zoom rules.
    // biome-ignore lint/correctness/useExhaustiveDependencies: the raster key changes when a fresh result replaces the source
    useLayoutEffect(() => {
        if (!showEffect) return
        const clear = () =>
            clearViewportCanvases(normalCanvasRef.current, invertedCanvasRef.current)
        // Activity can reconnect layout effects from a snapshot taken while the refs
        // were detached. Clear old DOM canvas pixels before making them visible.
        if (state.sliderRasterKey?.imageKey !== sliderRasterImageKey(state)) {
            clear()
            return
        }
        const copy = () => {
            const source = offscreenCanvasRef.current
            if (state.mode !== "slider") return
            if (!source || state.canvasContents !== displayedEffect) {
                clear()
                return
            }

            const zoom = scale.get()
            const scaledWidth = contentWidth * zoom
            const scaledHeight = contentHeight * zoom
            const geometry = {
                contentLeft: contentLeft + x.get() + (contentWidth - scaledWidth) / 2,
                contentTop: contentTop + y.get() + (contentHeight - scaledHeight) / 2,
                contentWidth: scaledWidth,
                contentHeight: scaledHeight,
                viewportWidth,
                viewportHeight,
                pixelRatio: viewportPixelRatio,
            }
            drawComparisonRegion(source, normalCanvasRef.current, geometry, smoothing)
            drawComparisonRegion(source, invertedCanvasRef.current, geometry, smoothing)
        }
        copy()

        let animationFrame: number | undefined
        const scheduleCopy = () => {
            if (animationFrame !== undefined) return
            animationFrame = requestAnimationFrame(() => {
                animationFrame = undefined
                if (
                    effectDisplay === "full" ||
                    !(x.isAnimating() || y.isAnimating() || scale.isAnimating())
                )
                    copy()
            })
        }
        const eventName = effectDisplay === "full" ? "change" : "animationComplete"
        const unsubscribeX = x.on(eventName, scheduleCopy)
        const unsubscribeY = y.on(eventName, scheduleCopy)
        const unsubscribeScale = scale.on(eventName, scheduleCopy)

        return () => {
            if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
            unsubscribeX()
            unsubscribeY()
            unsubscribeScale()
        }
    }, [
        contentHeight,
        contentLeft,
        contentTop,
        contentWidth,
        displayedEffect,
        effectDisplay,
        invertedCanvasRef,
        normalCanvasRef,
        offscreenCanvasRef,
        scale,
        showEffect,
        smoothing,
        snap.sliderRasterKey,
        state,
        viewportHeight,
        viewportPixelRatio,
        viewportWidth,
        x,
        y,
    ])

    useLayoutEffect(() => {
        if (snap.mode !== "slider") return
        const normal = normalCanvasRef.current
        const inverted = invertedCanvasRef.current
        return () => {
            // Keep the reusable image-space raster and release its viewport copies.
            clearViewportCanvases(normal, inverted)
            if (!state.sliderDragging) return
            state.sliderDragging = false
            state.sliderEffectDisplay = state.shiftHeld ? "full" : "trail"
        }
    }, [invertedCanvasRef, normalCanvasRef, snap.mode, state])

    const showFullEffect = effectDisplay === "full"
    const showSplitEffect = showFullEffect && displayedEffect !== "difference"

    function getFilter(side: "A" | "B") {
        if (displayedEffect === "none" || displayedEffect === "difference") return "none"
        let invert = side === "A"
        if (showSplitEffect) invert = !invert
        return invert ? "invert(1)" : "none"
    }

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
                <motion.div
                    style={{
                        backgroundColor: "var(--chakra-colors-bg-1)",
                        ...containerStyle,
                        overflow: "hidden",
                    }}
                >
                    <motion.img
                        id="img-b-slider"
                        crossOrigin="anonymous"
                        ref={refs.imgBRef}
                        draggable={false}
                        src={snap.imageBSrc}
                        alt=""
                        style={{
                            ...getComparisonImageStyle(snap, "b"),
                        }}
                    />
                </motion.div>
            </motion.div>

            <motion.canvas
                style={{
                    display:
                        showEffect && (effectDisplay === "trail" || showSplitEffect)
                            ? "block"
                            : "none",
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    zIndex: 2,
                    pointerEvents: "none",
                    clipPath: showSplitEffect ? leftOfSliderClipMv : "none",
                    maskImage: showSplitEffect ? "none" : mv.normalCanvasMaskMv,
                    WebkitMaskImage: showSplitEffect ? "none" : mv.normalCanvasMaskMv,
                    maskRepeat: "no-repeat",
                    WebkitMaskRepeat: "no-repeat",
                    mixBlendMode: "normal",
                    filter: getFilter("A"),
                }}
                id="image-compare-canvas-inverted"
                ref={refs.invertedCanvasRef}
            />

            <motion.canvas
                id="image-compare-canvas"
                ref={refs.normalCanvasRef}
                style={{
                    display: showEffect ? "block" : "none",
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    zIndex: 2,
                    pointerEvents: "none",
                    clipPath: showSplitEffect ? mv.clipMv : "none",
                    maskImage: showFullEffect ? "none" : mv.invertedCanvasMaskMv,
                    WebkitMaskImage: showFullEffect ? "none" : mv.invertedCanvasMaskMv,
                    maskRepeat: "no-repeat",
                    WebkitMaskRepeat: "no-repeat",
                    mixBlendMode: "normal",
                    filter: getFilter("B"),
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
                        if (event.button === 0) event.stopPropagation()
                    }}
                    onDragStart={() => {
                        state.sliderEffectDisplay = transitionSliderEffectDisplay(
                            state.sliderEffectDisplay,
                            "dragStart",
                            state.sliderDragging,
                        )
                        state.sliderDragging = true
                    }}
                    onDragEnd={() => {
                        state.sliderEffectDisplay = transitionSliderEffectDisplay(
                            state.sliderEffectDisplay,
                            "dragEnd",
                            state.sliderDragging,
                        )
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
                        backgroundColor={"grays.8"}
                        width={"2px"}
                        height="100%"
                        margin="auto"
                        boxSizing="content-box"
                        pointerEvents="none"
                    />
                </motion.div>
            </Box>
        </>
    )
}

function Settings(props: ModeSettingProps<SliderModeProps>) {
    const { selfProps, ...restProps } = props
    const [state, snap] = ImageCompareContext.useContext()

    const viewRef = useRootElementRef("view")
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [startCloseTimer, cancelCloseTimer] = useTimeout({
        fn: () => {
            setIsSettingsOpen(false)
        },
        delay: 600,
    })

    const onEnter = useCallback(() => {
        cancelCloseTimer()
        setIsSettingsOpen(true)
    }, [cancelCloseTimer])

    if (!selfProps) return null
    const { selectEffect, sliderTrail } = selfProps

    return (
        <ToolbarSection mode={"select"} {...restProps}>
            <ToolbarButton
                itemId={"none"}
                isSelected={sliderTrail === "none"}
                onClick={() => selectEffect("none")}
            >
                X{/*<FaToggleOff />*/}
            </ToolbarButton>
            <ToolbarButton
                itemId={"brightness"}
                isSelected={sliderTrail === "brightness"}
                onClick={() => selectEffect("brightness")}
            >
                <BrightnessEffect />
            </ToolbarButton>
            <ToolbarButton
                itemId={"color"}
                isSelected={sliderTrail === "color"}
                onClick={() => selectEffect("color")}
            >
                <ColorEffect />
            </ToolbarButton>
            <ToolbarButton
                itemId={"difference"}
                isSelected={sliderTrail === "difference"}
                onClick={() => selectEffect("difference")}
            >
                <DifferenceEffect />
            </ToolbarButton>

            <Popover.Root positioning={{ placement: "top" }} open={isSettingsOpen}>
                <Popover.Trigger _expanded={{ background: undefined }} asChild>
                    <SettingsButton
                        itemId={"settings"}
                        isOpen={isSettingsOpen}
                        onEnter={onEnter}
                        onLeave={startCloseTimer}
                    />
                </Popover.Trigger>
                <Portal container={viewRef}>
                    <Popover.Positioner>
                        <SettingsContent
                            state={state}
                            snap={snap}
                            onEnter={onEnter}
                            onLeave={startCloseTimer}
                        />
                    </Popover.Positioner>
                </Portal>
            </Popover.Root>
        </ToolbarSection>
    )
}

type PopoverContext = ReturnType<typeof usePopoverContext>
type PopoverTriggers = {
    onEnter: (context: PopoverContext) => void
    onLeave: (context: PopoverContext) => void
}

function SettingsButton(props: ComponentProps<typeof ToolbarButton> & PopoverTriggers) {
    const { onEnter, onLeave, ...restProps } = props

    const context = usePopoverContext()

    return (
        <ToolbarButton
            onMouseEnter={() => onEnter(context)}
            onMouseLeave={() => onLeave(context)}
            {...restProps}
        >
            <SliderSettings />
        </ToolbarButton>
    )
}

interface SettingsContentProps extends ComponentProps<typeof Popover.Content> {
    state: ReturnType<(typeof ImageCompareContext)["useContext"]>[0]
    snap: ReturnType<(typeof ImageCompareContext)["useContext"]>[1]
}

function SettingsContent(props: SettingsContentProps & PopoverTriggers) {
    const { state, snap, onEnter, onLeave, ...restProps } = props

    const context = usePopoverContext()

    return (
        <Popover.Content
            // borderRadius={"lg"}
            // boxShadow={"pane1"}
            // padding={4}
            asChild
        >
            <Panel
                variant={"float"}
                bgColor={"bg.1"}
                width={"15rem"}
                onMouseEnter={() => onEnter(context)}
                onMouseLeave={() => onLeave(context)}
                padding={3}
                {...restProps}
            >
                <Popover.Arrow css={{ "--arrow-background": "{colors.bg.1}" }} />
                <VStack gap={1}>
                    <HStack
                        padding={0}
                        color={"fg.1"}
                        justifyContent={"space-between"}
                        width={"full"}
                    >
                        <PanelSectionHeader>Threshold</PanelSectionHeader>
                        <Box>{snap.sliderThreshold}</Box>
                    </HStack>
                    <Slider
                        // minWidth="12rem"
                        width={"full"}
                        min={0}
                        max={0.2}
                        step={0.01}
                        value={[snap.sliderThreshold]}
                        onValueChange={(value) => {
                            state.sliderThreshold = value.value[0]
                        }}
                        mx={1}
                        marginBottom={"2"}
                    />{" "}
                    <HStack
                        padding={1}
                        color={"fg.1"}
                        justifyContent={"space-between"}
                        width={"full"}
                    >
                        <PanelSectionHeader>Gain</PanelSectionHeader>
                        <Box>{snap.sliderGain}</Box>
                    </HStack>
                    <Slider
                        width={"full"}
                        // minWidth="12rem"
                        min={1}
                        max={20}
                        step={1}
                        value={[snap.sliderGain]}
                        onValueChange={(value) => {
                            state.sliderGain = value.value[0]
                        }}
                        mx={1}
                    />
                </VStack>
            </Panel>
        </Popover.Content>
    )
}

function Button(props: ModeButtonProps) {
    const tip = `Drag the divider to compare images. Press Space to switch between effects that
                 highlight the differences between the images.`
    return (
        <ToolbarButton itemId={"slider"} tipTitle={"Slider"} tipText={tip} {...props}>
            <SliderCompare stroke={"currentColor"} strokeWidth={0.5} />
        </ToolbarButton>
    )
}

export default {
    name: "slider",
    View,
    Button,
    Settings,
    useMode,
} satisfies ImageCompareMode<SliderModeProps>
