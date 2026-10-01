import { Box, chakra, Grid, HStack, Kbd } from "@chakra-ui/react"
import { AnimatePresence, type MotionStyle, motion } from "motion/react"
import {
    Children,
    createContext,
    isValidElement,
    type ReactElement,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
} from "react"
import { MdBlurOff, MdBlurOn } from "react-icons/md"
import type { Snapshot } from "valtio"
import IconButton from "../IconButton"
import AltMode from "./AltMode"
import { ToolbarSection, ToolbarSeparator } from "./common"
import { type ImageCompareMode, type UseModeResult, useCreateImageCompareContext } from "./hooks"
import SbsMode from "./SbsMode"
import SliderMode from "./SliderMode"
import { ImageCompareContext, type ImageCompareState } from "./state"

export interface ImageCompareProps extends ChakraProps {
    a: string
    b: string
    children?: ReactNode
}

export interface ImageSelectorProps {
    image: "a" | "b"
    children: ReactNode
}

interface ImageSelectorContextValue {
    image: "a" | "b"
    setImage: (url: string) => void
}

const ImageSelectorContext = createContext<ImageSelectorContextValue | undefined>(undefined)

export function useImageSelector(): ImageSelectorContextValue {
    const context = useContext(ImageSelectorContext)
    if (!context) throw new Error("useImageSelector must be used within ImageCompare.ImageSelector")
    return context
}

function ImageSelector(props: ImageSelectorProps) {
    const { image, children } = props
    const state = ImageCompareContext.useContextState()
    const setImage = useCallback(
        (url: string) => {
            if (image === "a") state.imageASrc = url
            else state.imageBSrc = url
        },
        [image, state],
    )
    const value = useMemo(() => ({ image, setImage }), [image, setImage])

    return <ImageSelectorContext value={value}>{children}</ImageSelectorContext>
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

function Root(props: ImageCompareProps) {
    const { children, ...restProps } = props
    const [Provider, state, snap] = ImageCompareContext.useCreate(props)
    const [HooksProvider, hooks] = useCreateImageCompareContext(state, snap)
    const { refs, zoomHandlers, zoomStyle } = hooks

    const contentSize = snap.contentSize
    const contentOffset = snap.contentOffset

    const sliderMode = SliderMode.useMode(state, snap, hooks)
    const altMode = AltMode.useMode(state, snap, hooks)
    const sbsMode = SbsMode.useMode(state, snap, hooks)

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
    ]
    const activeMode = modes.find((mode) => mode.name === snap.mode)
    const imageSelectors = Children.toArray(children)
        .filter(
            (child): child is ReactElement<ImageSelectorProps> =>
                isValidElement(child) && child.type === ImageSelector,
        )
        .sort((a, b) => (a.props.image === b.props.image ? 0 : a.props.image === "a" ? -1 : 1))

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
                                }}
                                onLoad={(event) => onLoadA(event.currentTarget)}
                            />
                        </motion.div>

                        {modes.map((mode) => mode.view)}
                    </Box>

                    {/* toolbar */}
                    <HStack gridArea={"buttons"} px={8} py={2}>
                        {imageSelectors.length > 0 && (
                            <>
                                <ToolbarSection>{imageSelectors}</ToolbarSection>
                                <ToolbarSeparator />
                            </>
                        )}
                        <ToolbarSection>
                            <IconButton
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
                                {snap.smoothing ? <MdBlurOn /> : <MdBlurOff />}
                            </IconButton>
                        </ToolbarSection>
                        <ToolbarSeparator />
                        <ToolbarSection>
                            {/*<PanelSectionHeader>Mode</PanelSectionHeader>*/}
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
                        </ToolbarSection>

                        <ToolbarSeparator />

                        <Grid
                            overflow={"clip"}
                            gridTemplateRows={"100%"}
                            gridTemplateColumns={"100%"}
                        >
                            <AnimatePresence mode={"sync"}>
                                {modes.map((mode) => {
                                    if (mode.name !== snap.mode) return null
                                    return (
                                        <motion.div
                                            key={mode.name}
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
                                            style={{ gridRow: "1", gridColumn: "1" }}
                                        >
                                            {mode.settings}
                                        </motion.div>
                                    )
                                })}
                            </AnimatePresence>
                        </Grid>
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

const ImageCompare = { Root, ImageSelector }

export default ImageCompare
