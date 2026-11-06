import { Box } from "@chakra-ui/react"
import { motion } from "motion/react"
import { useMemo } from "react"

import type { Snapshot } from "valtio"
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
import { HorizontalLayout, SbsCompare, VerticalLayout } from "./icons"
import { getComparisonImageStyle } from "./imageGeometry"
import { ImageCompareContext, type ImageCompareState } from "./state"

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
    const [_state, snap] = ImageCompareContext.useContext()
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
            >
                <motion.div
                    style={{
                        ...containerStyle,
                        overflow: "hidden",
                        backgroundColor: "var(--chakra-colors-bg-1)",
                    }}
                >
                    <motion.img
                        id="img-b-sbs"
                        crossOrigin="anonymous"
                        draggable={false}
                        src={snap.imageBSrc}
                        alt=""
                        style={{
                            ...getComparisonImageStyle(snap, "b"),
                            pointerEvents: "none",
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
                variant="toolbar"
                tbActive={snap.sbsLayout === "vertical"}
                onClick={() => {
                    state.sbsLayout = "vertical"
                }}
            >
                <VerticalLayout />
            </IconButton>
            <IconButton
                variant="toolbar"
                tbActive={snap.sbsLayout === "horizontal"}
                onClick={() => {
                    state.sbsLayout = "horizontal"
                }}
            >
                <HorizontalLayout />
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
            variant="toolbar"
            tbActive={selected}
            tipTitle={"Side-by-side"}
            tipText={tip}
            {...restProps}
        >
            <SbsCompare />
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
