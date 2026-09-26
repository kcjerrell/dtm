import { Box, chakra, HStack, Kbd } from "@chakra-ui/react"
import { type MotionStyle, motion } from "motion/react"
import { type ReactElement, useCallback, useEffect, useMemo } from "react"
import { LuStretchHorizontal, LuStretchVertical } from "react-icons/lu"
import { RiLayoutColumnFill } from "react-icons/ri"
import type { Snapshot } from "valtio"
import { PanelSectionHeader } from "@/components/common"
import IconButton from "../IconButton"
import AltMode from "./AltMode"
import { type ImageCompareMode, type UseModeResult, useCreateImageCompareContext } from "./hooks"
import SliderMode from "./SliderMode"
import { ImageCompareContext, type ImageCompareState } from "./state"

export interface ImageCompareProps extends ChakraProps {
    a: string
    b: string
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

function ImageCompare(props: ImageCompareProps) {
    const { ...restProps } = props
    const [Provider, state, snap] = ImageCompareContext.useCreate(props)
    const [HooksProvider, hooks] = useCreateImageCompareContext(state, snap)
    const { refs, mv, zoomHandlers, zoomStyle } = hooks

    const contentSize = snap.contentSize
    const contentOffset = snap.contentOffset

    const altMode = AltMode.useMode(state, snap, hooks)
    const sliderMode = SliderMode.useMode(state, snap, hooks)
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
        bindMode(AltMode, altMode, imageContainerStyle),
        bindMode(SliderMode, sliderMode, imageContainerStyle),
    ]
    const activeMode = modes.find((mode) => mode.name === snap.mode)
    const { copyComparisonBuffer, drawComparison } = sliderMode.selfProps

    const onLoadA = useCallback(
        (element: HTMLImageElement) => {
            state.imageAWidth = element.naturalWidth
            state.imageAHeight = element.naturalHeight
        },
        [state],
    )

    useEffect(() => {
        const keydown = (e: KeyboardEvent) => {
            if (e.key === "Shift") {
                state.shiftHeld = true
            } else if (e.code === "Space") {
                activeMode?.keyHandlers?.space?.()
                // if (state.mode === "slider") {
                //     if (state.sliderTrail === "none") drawComparison("brightness")
                //     else if (state.sliderTrail === "brightness") drawComparison("color")
                //     else if (state.sliderTrail === "color") drawComparison("difference")
                //     else {
                //         state.sliderTrail = "none"
                //         state.canvasContents = "none"
                //         copyComparisonBuffer("none")
                //     }
                // } else if (state.mode === "sbs") {
                //     state.sbsLayout = state.sbsLayout === "horizontal" ? "vertical" : "horizontal"
                // }
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
    }, [state, activeMode?.keyHandlers])

    return (
        <HooksProvider value={hooks}>
            <Provider>
                <GridRoot
                    cursor={snap.sliderDragging ? "none" : undefined}
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
                                onLoad={(event) => onLoadA(event.currentTarget)}
                            />
                        </motion.div>

                        {modes.map((mode) => mode.view)}
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
                            {modes.map((mode) => {
                                const ModeButton = mode.Button
                                return (
                                    <ModeButton
                                        key={mode.name}
                                        selected={snap.mode === mode.name}
                                        onClick={() => {
                                            state.mode = mode.name
                                        }}
                                    />
                                )
                            })}
                            <IconButton
                                tone={snap.mode === "sbs" ? "selected" : "none"}
                                onClick={() => {
                                    state.mode = "sbs"
                                }}
                            >
                                <RiLayoutColumnFill />
                            </IconButton>
                        </HStack>

                        {modes.map((mode) => mode.settings)}

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
