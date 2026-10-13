import { Grid } from "@chakra-ui/react"
import { motion } from "motion/react"
import { type CSSProperties, useMemo } from "react"
import { PiRepeatBold } from "react-icons/pi"
import type { Snapshot } from "valtio"
import { IconButton } from "@/components"
import { TriangleSlider } from "../ui/slider"
import { ToolbarSection } from "./common"
import type {
    ImageCompareHooksContextType,
    ImageCompareMode,
    ModeButtonProps,
    ModeSettingProps,
    ModeViewProps,
    UseModeResult,
} from "./hooks"
import { ImageCompareContext, type ImageCompareState } from "./state"

const ALT_ANIM_STYLE = {
    animationDuration: "var(--alt-duration)",
    animationPlayState: "var(--alt-state)",
    animationDelay: "calc(var(--alt-duration) * var(--alt-phase) * -1)",
} as CSSProperties

function useMode(
    state: ImageCompareState,
    snap: Snapshot<ImageCompareState>,
    _hooks: ImageCompareHooksContextType,
): UseModeResult<never> {
    const altAnimationDuration = `${3 / snap.altSpeed}s`
    const altAnimationState = snap.shiftHeld || snap.altSpeedInput === 0 ? "paused" : "running"
    const altPhase = ((snap.shiftHeld && snap.altSpeedInput === 0 ? 0.5 : 0) + snap.altPhase) % 1

    const rootProps: ChakraProps = {
        style: {
            "--alt-duration": altAnimationDuration,
            "--alt-state": altAnimationState,
            "--alt-phase": altPhase,
        } as CSSProperties,
    }

    const keyHandlers = useMemo(
        () => ({
            space: () => {
                if (state.altSpeedInput === 0) state.altSpeedInput = state.altSpeed
                else state.altSpeedInput = 0
            },
        }),
        [state],
    )

    return { rootProps, keyHandlers }
}

function View(props: ModeViewProps<never>) {
    const { containerStyle, selfProps: _selfProps, ...restProps } = props
    const [_, snap] = ImageCompareContext.useContext()

    return (
        <motion.div
            style={{
                display: snap.mode === "alt" ? "block" : "none",
                ...containerStyle,
                zIndex: 1,
                pointerEvents: "none",
            }}
            {...restProps}
        >
            <motion.img
                id={"img-b-alt"}
                crossOrigin="anonymous"
                draggable={false}
                src={snap.imageBSrc}
                alt="b"
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    ...ALT_ANIM_STYLE,
                }}
                className="blink-anim"
            />
        </motion.div>
    )
}

function Settings(props: ModeSettingProps<never>) {
    const { selfProps: _selfProps, ...restProps } = props
    const [state, snap] = ImageCompareContext.useContext()

    return (
        <ToolbarSection fontSize={"sm"} fontWeight={"500"} {...restProps}>
            <Grid>
                <IconButton
                    gridColumn={"1"}
                    gridRow={"1"}
                    size={"sm"}
                    fontSize={"xs"}
                    bgColor={"bg.2"}
                >
                    A
                </IconButton>
                <IconButton
                    gridColumn={"1"}
                    gridRow={"1"}
                    size={"sm"}
                    fontSize={"xs"}
                    bgColor={"bg.2"}
                    className={"blink-anim"}
                    style={{
                        ...ALT_ANIM_STYLE,
                    }}
                >
                    B
                </IconButton>
            </Grid>
            {/*Slow*/}
            <TriangleSlider
                size={"sm"}
                width={"6rem"}
                min={0}
                max={10}
                aria-label={["Alternation speed"]}
                value={[snap.altSpeedInput]}
                onValueChange={(value) => {
                    state.altSpeedInput = value.value[0]
                    if (value.value[0] !== 0) state.altSpeed = value.value[0]
                }}
                mx={1}
            />
            {/*Fast*/}
        </ToolbarSection>
    )
}

function Button(props: ModeButtonProps) {
    const { selected, ...restProps } = props

    // const tip = (
    //     <>
    //         <PanelSectionHeader fontWeight={"600"}>Swap</PanelSectionHeader>
    //         <p>
    //             Images switch back and forth at a customizable rate. Hold <Kbd>Shift</Kbd> to
    //             temporarily pause the animation, or <Kbd>Space</Kbd> to stop it. Holding
    //             <Kbd>Shift</Kbd> while stopped will switch to the other image.
    //         </p>
    //     </>
    // )

    const tip = `Images switch back and forth at a customizable rate. Hold Shift to temporarily
                 pause the animation or Space to stop it. Hold Shift while stopped to switch
                 between images.`

    return (
        <IconButton
            tone={selected ? "selected" : "none"}
            tipTitle={"Swap"}
            tipText={tip}
            {...restProps}
        >
            <PiRepeatBold />
        </IconButton>
    )
}

export default {
    name: "alt",
    View,
    Button,
    Settings,
    useMode,
} satisfies ImageCompareMode<never>
