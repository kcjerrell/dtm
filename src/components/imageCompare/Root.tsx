import { Box, chakra, Flex, Grid, HStack, Kbd } from "@chakra-ui/react"
import { AnimatePresence, type MotionStyle, motion } from "motion/react"
import {
    Children,
    type CSSProperties,
    isValidElement,
    type PropsWithChildren,
    type ReactElement,
    type ReactNode,
    useEffect,
    useMemo,
} from "react"
import type { Snapshot } from "valtio"
import IconButton from "../IconButton"
import { ToolbarSection } from "../toolbar/ToolbarSection"
import AlignMode from "./AlignMode"
import AltMode from "./AltMode"
import { type ImageCompareMode, type UseModeResult, useCreateImageCompareContext } from "./hooks"
import type { ImageSelectorProps } from "./ImageSelector"
import { SmoothingOff, SmoothingOn } from "./icons"
import { getComparisonImageStyle } from "./imageGeometry"
import SbsMode from "./SbsMode"
import SliderMode from "./SliderMode"
import { ImageCompareContext, type ImageCompareState } from "./state"
import ToolbarButton from "../toolbar/ToolbarButton"

export interface ImageCompareRootProps extends ChakraProps {
    a?: string
    b?: string
    children?: ReactNode
    toolbarProps?: ChakraProps
    imageProps?: CSSProperties
}

interface BoundMode {
    name: string
    rootProps?: ChakraProps
    Button: ImageCompareMode<unknown>["Button"]
    view: ReactElement
    settings: ReactElement
    keyHandlers?: Record<"space", () => void>
}

function bindMode<T>(
    Mode: ImageCompareMode<T>,
    value: UseModeResult<T>,
    containerStyle: MotionStyle,
): BoundMode {
    return {
        name: Mode.name,
        rootProps: value.rootProps,
        Button: Mode.Button,
        view: (
            <Mode.View
                key={Mode.name}
                containerStyle={containerStyle}
                selfProps={value.selfProps}
            />
        ),
        settings: <Mode.Settings key={Mode.name} selfProps={value.selfProps} />,
        keyHandlers: value.keyHandlers,
    }
}

function Root(props: ImageCompareRootProps) {
    const { children, imageProps, toolbarProps, a, b, ...restProps } = props
    const [Provider, state, snap] = ImageCompareContext.useCreate(props)
    const [HooksProvider, hooks] = useCreateImageCompareContext(state, snap)
    const { refs, zoomHandlers, zoomStyle } = hooks
    const { setImage } = hooks

    const contentSize = snap.contentSize
    const contentOffset = snap.contentOffset

    const sliderMode = SliderMode.useMode(state, snap, hooks)
    const altMode = AltMode.useMode(state, snap, hooks)
    const sbsMode = SbsMode.useMode(state, snap, hooks)
    const alignMode = AlignMode.useMode()

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

    const modes = [
        bindMode(SliderMode, sliderMode, imageContainerStyle),
        bindMode(AltMode, altMode, imageContainerStyle),
        bindMode(SbsMode, sbsMode, imageContainerStyle),
        bindMode(AlignMode, alignMode, imageContainerStyle),
    ]
    const activeIndex = modes.findIndex((mode) => mode.name === snap.mode)
    const activeMode = modes[activeIndex]

    const imageSelectors = Children.toArray(children)
        .filter(
            (child): child is ReactElement<ImageSelectorProps> =>
                isValidElement(child) &&
                typeof child.type === "function" &&
                "slot" in child.type &&
                child.type.slot === "ImageCompare.ImageSelector",
        )
        .sort((a, b) => (a.props.image === b.props.image ? 0 : a.props.image === "A" ? -1 : 1))

    const topLayer = Children.toArray(children).find(
        (child) =>
            isValidElement(child) &&
            typeof child.type === "function" &&
            "slot" in child.type &&
            child.type.slot === "ImageCompare.TopLayer",
    )

    useEffect(() => {
        setImage("A", a)
    }, [a, setImage])

    useEffect(() => {
        setImage("B", b)
    }, [b, setImage])

    useEffect(() => {
        const keydown = (e: KeyboardEvent) => {
            if (e.defaultPrevented) return
            if (e.key === "Shift") {
                state.shiftHeld = true
                return
            }
            // Preserve normal keyboard interaction in controls and the alignment overlay.
            if (
                e.target instanceof Element &&
                e.target.closest(
                    "button, input, textarea, select, [contenteditable='true'], [role='slider'], [data-image-align], [data-image-compare-controls]",
                )
            )
                return
            if (e.code === "Space") {
                activeMode?.keyHandlers?.space?.()
            } else if (e.code === "Tab") {
                e.preventDefault()
                const names = ["slider", "alt", "sbs", "align"]
                state.mode =
                    names[
                        (names.indexOf(state.mode) + (e.shiftKey ? -1 : 1) + names.length) %
                            names.length
                    ]
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
    }, [state, activeMode?.keyHandlers])

    return (
        <HooksProvider value={hooks}>
            <Provider>
                <GridRoot
                    cursor={snap.sliderDragging ? "none" : undefined}
                    imageRendering={snap.smoothing ? "smooth" : "pixelated"}
                    // defining anim duration on common parent
                    {...(activeMode?.rootProps ?? {})}
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
                        {...zoomHandlers}
                    >
                        {/* image a base */}
                        <Box
                            position="absolute"
                            inset={0}
                            clipPath={
                                snap.mode === "sbs"
                                    ? snap.sbsLayout === "vertical"
                                        ? "inset(0 50% 0 0)"
                                        : "inset(0 0 50% 0)"
                                    : undefined
                            }
                        >
                            <motion.div
                                id="image-compare-stage"
                                style={{
                                    ...imageContainerStyle,
                                    backgroundColor: "var(--chakra-colors-bg-2)",
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
                                        ...getComparisonImageStyle(snap, "a"),
                                        pointerEvents: "none",
                                    }}
                                />
                            </motion.div>
                        </Box>

                        {modes.map((mode) => mode.view)}
                    </Box>

                    {topLayer}

                    {/* toolbar */}
                    <HStack
                        gridArea={"buttons"}
                        px={8}
                        py={0}
                        boxShadow={"0px 0px 5px -1px #00000055, 0px 3px 12px -3px #00000055"}
                        zIndex={2}
                        gap={3}
                        {...toolbarProps}
                    >
                        {imageSelectors.length > 0 && (
                            <ToolbarSection>{imageSelectors}</ToolbarSection>
                        )}
                        <ToolbarSection>
                            <ToolbarButton
                                itemId="smoothing"
                                tipTitle={snap.smoothing ? "Disable smoothing" : "Enable smoothing"}
                                tipText={
                                    snap.smoothing
                                        ? "Click to disable smoothing on scaled-up images."
                                        : "Click to enable smoothing on scaled-up images."
                                }
                                onClick={() => {
                                    state.smoothing = !snap.smoothing
                                }}
                            >
                                {snap.smoothing ? <SmoothingOn /> : <SmoothingOff />}
                            </ToolbarButton>
                        </ToolbarSection>
                        <ToolbarSection mode={"select"}>
                            {modes.map((mode, index) => {
                                const ModeButton = mode.Button
                                return (
                                    <ModeButton
                                        key={mode.name}
                                        isSelected={snap.mode === mode.name}
                                        onClick={() => {
                                            console.log("hello", state.mode, mode.name)
                                            state.mode = mode.name
                                        }}
                                    />
                                )
                            })}
                        </ToolbarSection>

                        <HStack
                            clipPath={"rect(-3px 100% 100% 0)"}
                            // gridTemplateRows={"100%"}
                            // gridTemplateColumns={"100%"}
                        >
                            <AnimatePresence mode={"popLayout"}>
                                {modes.map((mode) => {
                                    if (mode.name !== snap.mode) return null
                                    return (
                                        <HStack asChild key={mode.name}>
                                            <motion.div
                                                initial={{
                                                    x: "-100%",
                                                    opacity: 1,
                                                }}
                                                animate={{ x: "0%", opacity: 1 }}
                                                exit={{
                                                    // x: "-100%",
                                                    opacity: 0,
                                                    transition: {
                                                        duration: 0.2,
                                                        ease: "circOut",
                                                        delay: 0,
                                                    },
                                                }}
                                                transition={{
                                                    duration: 0.2,
                                                    ease: "circOut",
                                                    delay: 0.1,
                                                }}
                                                style={{
                                                    gridRow: "1",
                                                    gridColumn: "1",
                                                }}
                                            >
                                                {mode.settings}
                                            </motion.div>
                                        </HStack>
                                    )
                                })}
                            </AnimatePresence>
                        </HStack>
                        <ShiftHint snap={snap} ml={"auto"} />
                    </HStack>
                </GridRoot>
            </Provider>
        </HooksProvider>
    )
}

interface TopLayerProps extends PropsWithChildren {
    show: boolean
}

export function TopLayer(props: TopLayerProps) {
    const { show, children } = props
    return (
        <Flex display={show ? "flex" : "none"} gridArea={"image"} zIndex={50}>
            {children}
        </Flex>
    )
}
TopLayer.slot = "ImageCompare.TopLayer"

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
    if (snap.mode === "align") {
        return snap.shiftHeld ? "adjust image B" : "pan"
    }
    if (snap.mode === "slider") {
        if (snap.sliderEffectDisplay === "full") {
            if (snap.canvasContents === "none") return null
            return snap.sliderDragging ? "show trail effect" : "hide whole effect"
        }
        if (snap.sliderEffectDisplay === "hidden") {
            return snap.sliderTrail === "none" ? null : "show trail effect"
        }
        if (snap.shiftHeld) return null
        if (snap.sliderDragging) {
            return snap.sliderTrail === "none" ? null : "hide trail effect"
        }
        return snap.canvasContents === "none" ? null : "show whole effect"
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
        <Box
            fontSize={"sm"}
            alignSelf={"center"}
            justifySelf={"center"}
            whiteSpace="nowrap"
            {...rest}
        >
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
        gridTemplateColumns: "1fr",
        gridTemplateRows: "minmax(0, 1fr) min-content",
        gridTemplateAreas: '"image" "buttons"',
    },
})

export default Root
