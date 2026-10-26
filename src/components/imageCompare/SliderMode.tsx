import { Box, HStack, Popover, Portal, VStack } from "@chakra-ui/react"
import { usePopoverContext } from "@chakra-ui/react/popover"
import { useDebounceFn } from "ahooks"
import { motion, useTransform } from "motion/react"
import { type ComponentProps, useCallback, useEffect, useMemo, useState } from "react"
import { ImBrightnessContrast } from "react-icons/im"
import { IoInvertMode } from "react-icons/io5"
import { MdOutlineColorLens } from "react-icons/md"
import { TbAdjustmentsHorizontal } from "react-icons/tb"
import { TfiSplitH } from "react-icons/tfi"
import type { Snapshot } from "valtio"
import { subscribeKey } from "valtio/utils"
import { Panel, PanelSectionHeader } from "@/components/common"
import { Slider } from "@/components/ui/slider"
import { useRootElementRef } from "@/hooks/useRootElement"
import { useTimeout } from "@/hooks/useTimeout"
import IconButton from "../IconButton"
import { ToolbarSection } from "./common"
import {
    type ImageCompareHooksContextType,
    type ImageCompareMode,
    type ModeButtonProps,
    type ModeSettingProps,
    type ModeViewProps,
    type UseModeResult,
    useImageCompareHooks,
} from "./hooks"
import { getComparisonImageStyle } from "./imageGeometry"
import { type SliderEffectDisplay, transitionSliderEffectDisplay } from "./sliderEffectDisplay"
import { ImageCompareContext, type ImageCompareState, type SliderEffect } from "./state"
import { useSliderComparison } from "./useSliderComparison"

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
    displayedEffect: SliderEffect
    effectDisplay: SliderEffectDisplay
    sliderButtonTone: "info" | "selected"
    selectEffect: (effect: SliderEffect) => void
    updateEffectParam: () => void
}

const NEXT_SLIDER_EFFECT: Record<SliderEffect, SliderEffect> = {
    none: "brightness",
    brightness: "color",
    color: "difference",
    difference: "none",
}

function drawComparisonRegion(
    source: HTMLCanvasElement | null,
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
    hooks: ImageCompareHooksContextType,
): UseModeResult<SliderModeProps> {
    const { refs, zoomStyle } = hooks
    const contentSize = snap.contentSize
    const contentOffset = snap.contentOffset

    const sliderTrail = snap.sliderTrail
    const effectDisplay = snap.sliderEffectDisplay
    const displayedEffect = effectDisplay === "full" ? snap.canvasContents : sliderTrail
    const sliderButtonTone = snap.shiftHeld ? ("info" as const) : ("selected" as const)

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

    const copyComparisonBuffer = useCallback(
        (effect: SliderEffect = state.canvasContents) => {
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

            drawComparisonRegion(source, refs.normalCanvasRef.current, geometry, snap.smoothing)
            drawComparisonRegion(source, refs.invertedCanvasRef.current, geometry, snap.smoothing)
        },
        [
            contentOffset.left,
            contentOffset.top,
            contentSize.height,
            contentSize.width,
            snap.viewportHeight,
            snap.viewportPixelRatio,
            snap.viewportWidth,
            snap.smoothing,
            state,
            zoomStyle.scale,
            zoomStyle.x,
            zoomStyle.y,
            refs,
        ],
    )

    const copySettledComparisonBuffer = useCallback(
        (effect: SliderEffect = state.canvasContents) => {
            if (
                effect !== "none" &&
                (zoomStyle.x.isAnimating() ||
                    zoomStyle.y.isAnimating() ||
                    zoomStyle.scale.isAnimating())
            ) {
                return
            }
            copyComparisonBuffer(effect)
        },
        [copyComparisonBuffer, state, zoomStyle.scale, zoomStyle.x, zoomStyle.y],
    )

    const copyActiveComparisonBuffer = useCallback(
        (effect: SliderEffect = state.canvasContents) => {
            if (state.sliderEffectDisplay === "full") copyComparisonBuffer(effect)
            else copySettledComparisonBuffer(effect)
        },
        [copyComparisonBuffer, copySettledComparisonBuffer, state],
    )

    const generateComparison = useSliderComparison(state, snap, refs, copyActiveComparisonBuffer)

    const { run: updateEffectParam } = useDebounceFn(generateComparison, { wait: 500 })

    useEffect(() => {
        let animationFrame: number | undefined
        const scheduleCopy = () => {
            if (animationFrame !== undefined) return
            animationFrame = requestAnimationFrame(() => {
                animationFrame = undefined
                if (effectDisplay === "full") copyComparisonBuffer()
                else copySettledComparisonBuffer()
            })
        }
        const eventName = effectDisplay === "full" ? "change" : "animationComplete"
        const unsubscribeX = zoomStyle.x.on(eventName, scheduleCopy)
        const unsubscribeY = zoomStyle.y.on(eventName, scheduleCopy)
        const unsubscribeScale = zoomStyle.scale.on(eventName, scheduleCopy)
        scheduleCopy()

        return () => {
            if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
            unsubscribeX()
            unsubscribeY()
            unsubscribeScale()
        }
    }, [
        copyComparisonBuffer,
        copySettledComparisonBuffer,
        effectDisplay,
        zoomStyle.scale,
        zoomStyle.x,
        zoomStyle.y,
    ])

    const selectEffect = useCallback(
        (effect: SliderEffect) => {
            state.sliderTrail = effect
            if (effect === "none") {
                state.canvasContents = "none"
                copyActiveComparisonBuffer("none")
            }
        },
        [copyActiveComparisonBuffer, state],
    )

    const keyHandlers = useMemo(
        () => ({
            space: () => {
                selectEffect(NEXT_SLIDER_EFFECT[state.sliderTrail])
            },
        }),
        [selectEffect, state],
    )

    const selfProps = useMemo(
        () => ({
            sliderTrail,
            displayedEffect,
            effectDisplay,
            sliderButtonTone,
            selectEffect,
            updateEffectParam,
        }),
        [
            displayedEffect,
            effectDisplay,
            selectEffect,
            sliderButtonTone,
            sliderTrail,
            updateEffectParam,
        ],
    )

    return { selfProps, keyHandlers }
}

function View(props: ModeViewProps<SliderModeProps>) {
    const { containerStyle, selfProps } = props
    const [state, snap] = ImageCompareContext.useContext()
    const { refs, mv } = useImageCompareHooks()
    const leftOfSliderClipMv = useTransform(
        mv.sliderMv,
        (value) => `inset(0 ${(1 - value) * 100}% 0 0)`,
    )
    if (!selfProps) return null

    const { displayedEffect, effectDisplay } = selfProps
    const showEffect =
        snap.mode === "slider" && displayedEffect !== "none" && effectDisplay !== "hidden"
    const showFullEffect = effectDisplay === "full"
    const showSplitEffect = showFullEffect && displayedEffect !== "difference"

    return (
        <>
            <motion.div
                style={{
                    display: snap.mode === "slider" ? "block" : "none",
                    position: "absolute",
                    inset: 0,
                    zIndex: 1,
                    clipPath: mv.clipMv,
                    backgroundColor: "var(--chakra-colors-bg-1)",
                    pointerEvents: "none",
                }}
            >
                <motion.div style={{ ...containerStyle, overflow: "hidden" }}>
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
                }}
            />

            <motion.canvas
                id="image-compare-canvas-inverted"
                ref={refs.invertedCanvasRef}
                style={{
                    display: showEffect ? "block" : "none",
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    zIndex: 2,
                    pointerEvents: "none",
                    filter: displayedEffect === "difference" ? "none" : "invert(1)",
                    clipPath: showSplitEffect ? mv.clipMv : "none",
                    maskImage: showFullEffect ? "none" : mv.invertedCanvasMaskMv,
                    WebkitMaskImage: showFullEffect ? "none" : mv.invertedCanvasMaskMv,
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
    const { selectEffect, sliderButtonTone, sliderTrail, updateEffectParam } = selfProps

    return (
        <ToolbarSection {...restProps}>
            <IconButton
                tone={sliderTrail === "none" ? sliderButtonTone : "none"}
                onClick={() => selectEffect("none")}
            >
                X{/*<FaToggleOff />*/}
            </IconButton>
            <IconButton
                tone={sliderTrail === "brightness" ? sliderButtonTone : "none"}
                onClick={() => selectEffect("brightness")}
            >
                <ImBrightnessContrast />
            </IconButton>
            <IconButton
                tone={sliderTrail === "color" ? sliderButtonTone : "none"}
                onClick={() => selectEffect("color")}
            >
                <MdOutlineColorLens />
            </IconButton>
            <IconButton
                tone={sliderTrail === "difference" ? sliderButtonTone : "none"}
                onClick={() => selectEffect("difference")}
            >
                <IoInvertMode />
            </IconButton>

            <Popover.Root positioning={{ placement: "top" }} open={isSettingsOpen}>
                <Popover.Trigger _expanded={{ background: undefined }} asChild>
                    <SettingsButton
                        active={isSettingsOpen}
                        onEnter={onEnter}
                        onLeave={startCloseTimer}
                    />
                </Popover.Trigger>
                <Portal container={viewRef}>
                    <Popover.Positioner>
                        <SettingsContent
                            state={state}
                            snap={snap}
                            updateEffectParam={updateEffectParam}
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

function SettingsButton(props: ComponentProps<typeof IconButton> & PopoverTriggers) {
    const { onEnter, onLeave, ...restProps } = props

    const context = usePopoverContext()

    return (
        <IconButton
            onMouseEnter={() => onEnter(context)}
            onMouseLeave={() => onLeave(context)}
            {...restProps}
        >
            <TbAdjustmentsHorizontal />
        </IconButton>
    )
}

interface SettingsContentProps extends ComponentProps<typeof Popover.Content> {
    state: ReturnType<(typeof ImageCompareContext)["useContext"]>[0]
    snap: ReturnType<(typeof ImageCompareContext)["useContext"]>[1]
    updateEffectParam: () => void
}

function SettingsContent(props: SettingsContentProps & PopoverTriggers) {
    const { state, snap, updateEffectParam, onEnter, onLeave, ...restProps } = props

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
                            updateEffectParam()
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
                            updateEffectParam()
                        }}
                        mx={1}
                    />
                </VStack>
            </Panel>
        </Popover.Content>
    )
}

function Button(props: ModeButtonProps) {
    const { selected, ...restProps } = props

    const tip = `Drag the divider to compare images. Press Space to switch between effects that
                 highlight the differences between the images.`
    return (
        <IconButton
            tone={selected ? "selected" : "none"}
            tipTitle={"Slider"}
            tipText={tip}
            {...restProps}
        >
            <TfiSplitH />
        </IconButton>
    )
}

export default {
    name: "slider",
    View,
    Button,
    Settings,
    useMode,
} satisfies ImageCompareMode<SliderModeProps>
