import { Box, HStack, Kbd } from "@chakra-ui/react"
import { motion } from "motion/react"
import { useMemo } from "react"
import { LuStretchHorizontal, LuStretchVertical } from "react-icons/lu"
import { RiLayoutColumnFill } from "react-icons/ri"
import type { Snapshot } from "valtio"
import { PanelSectionHeader } from "@/components/common"
import IconButton from "../IconButton"
import {
    type ImageCompareHooksContextType,
    type ImageCompareMode,
    type ModeButtonProps,
    type ModeSettingProps,
    type ModeViewProps,
    type UseModeResult,
    useImageCompareHooks,
} from "./hooks"
import { ImageCompareContext, type ImageCompareState } from "./state"
import { ToolbarSection } from "./common"

function useMode(
    state: ImageCompareState,
    _snap: Snapshot<ImageCompareState>,
    _hooks: ImageCompareHooksContextType,
): UseModeResult<never> {
    const keyHandlers = useMemo(
        () => ({
            space: () => {
                state.sbsLayout = state.sbsLayout === "horizontal" ? "vertical" : "horizontal"
            },
        }),
        [state],
    )

    return { keyHandlers }
}

function View(props: ModeViewProps<never>) {
    const { containerStyle, selfProps: _selfProps, ...restProps } = props
    const [state, snap] = ImageCompareContext.useContext()
    const { refs } = useImageCompareHooks()

    return (
        <motion.div
            id="image-compare-sbs"
            style={{
                display: snap.mode === "sbs" ? "flex" : "none",
                position: "absolute",
                inset: 0,
                flexDirection: snap.sbsLayout === "horizontal" ? "column" : "row",
                zIndex: 1,
                pointerEvents: "none",
            }}
            {...restProps}
        >
            <Box
                ref={refs.sbsPaneARef}
                flex="1 1 0"
                position="relative"
                minWidth={0}
                minHeight={0}
                overflow="hidden"
            />
            <Box
                ref={refs.sbsPaneBRef}
                flex="1 1 0"
                position="relative"
                minWidth={0}
                minHeight={0}
                overflow="hidden"
                bgColor="bg.1"
            >
                <motion.div style={containerStyle}>
                    <motion.img
                        id="img-b-sbs"
                        crossOrigin="anonymous"
                        draggable={false}
                        src={snap.imageBSrc}
                        alt=""
                        style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            pointerEvents: "none",
                        }}
                        onLoad={(event) => {
                            state.imageBWidth = event.currentTarget.naturalWidth
                            state.imageBHeight = event.currentTarget.naturalHeight
                        }}
                    />
                </motion.div>
            </Box>
        </motion.div>
    )
}

function Settings(props: ModeSettingProps<never>) {
    const { selfProps: _selfProps, ...restProps } = props
    const [state, snap] = ImageCompareContext.useContext()

    return (
        <ToolbarSection {...restProps}>
            <IconButton
                tone={snap.sbsLayout === "vertical" ? "selected" : "none"}
                onClick={() => {
                    state.sbsLayout = "vertical"
                }}
            >
                <LuStretchVertical />
            </IconButton>
            <IconButton
                tone={snap.sbsLayout === "horizontal" ? "selected" : "none"}
                onClick={() => {
                    state.sbsLayout = "horizontal"
                }}
            >
                <LuStretchHorizontal />
            </IconButton>
        </ToolbarSection>
    )
}

function Button(props: ModeButtonProps) {
    const { selected, ...restProps } = props

    const tip = `View, pan, and zoom images in synced side-by-side panes. Press Space to switch
                 between horizontal and vertical panes.`

    return (
        <IconButton
            tone={selected ? "selected" : "none"}
            tipTitle={"Side-by-side"}
            tipText={tip}
            {...restProps}
        >
            <RiLayoutColumnFill />
        </IconButton>
    )
}

export default {
    name: "sbs",
    View,
    Button,
    Settings,
    useMode,
} satisfies ImageCompareMode<never>
