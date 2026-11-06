import { chakra } from "@chakra-ui/react"
import { motion } from "motion/react"

export const ContentHeaderContainer = chakra("div", {
    base: {
        display: "flex",
        flexDirection: "row",
        padding: 2,
        height: "3rem",
        justifyContent: "center",
        width: "100%",
        zIndex: 2,
    },
})

export const ToolbarContainer = chakra("div", {
    base: {
        display: "flex",
        position: "relative",
        alignItems: "flex-start",
        justifyContent: "center",
        overflow: "visible",
        maxHeight: "100%",
    },
})

export const ToolbarRoot = motion.create(
    chakra("div", {
        base: {
            display: "flex",
            flexDirection: "column",
            gap: 0,
            bgColor: "bg.1",
            flex: "0 0 auto",
            borderRadius: "xl",
            border: "pane1",
            overflow: "hidden",
            boxShadow: "pane1",
            height: "auto",
            width: "min-content",
            alignItems: "stretch",
            justifyContent: "center",
        },
    }),
)

export const ToolbarButtonGroup = motion(
    chakra("div", {
        base: {
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            gap: 0,
            overflow: "hidden",
            // width: "auto"
        },
    }),
)
