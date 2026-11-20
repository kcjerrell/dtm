// Adapted from Chakra UI's MIT-licensed toast recipe (Copyright 2019 Chakra Systems Inc.).
import { toastAnatomy } from "@chakra-ui/react/anatomy"
import { defineSlotRecipe } from "@chakra-ui/react/styled-system"

export const toastRecipe = defineSlotRecipe({
    slots: toastAnatomy.keys(),
    className: "chakra-toast",
    base: {
        root: {
            layerStyle: "tooltipSurface",
            width: "full",
            display: "flex",
            alignItems: "flex-start",
            position: "relative",
            gap: "3",
            py: "4",
            ps: "4",
            pe: "6",
            borderRadius: "l2",
            translate: "var(--x) var(--y)",
            scale: "var(--scale)",
            zIndex: "var(--z-index)",
            height: "var(--height)",
            opacity: "var(--opacity)",
            willChange: "translate, opacity, scale",
            transition:
                "translate 400ms, scale 400ms, opacity 400ms, height 400ms, box-shadow 200ms",
            transitionTimingFunction: "cubic-bezier(0.21, 1.02, 0.73, 1)",
            _closed: {
                transition: "translate 400ms, scale 400ms, opacity 200ms",
                transitionTimingFunction: "cubic-bezier(0.06, 0.71, 0.55, 1)",
            },
            "--toast-trigger-bg": "colors.bg.3",
            "&[data-type=error]": {
                bgColor: "red.subtle",
                color: "red.fg",
                borderColor: "red.emphasized",
                "--toast-trigger-bg": "colors.red.muted",
            },
            "&[data-type=success]": {
                bgColor: "green.subtle",
                color: "green.fg",
                borderColor: "green.emphasized",
                "--toast-trigger-bg": "colors.green.muted",
            },
            "&[data-type=warning]": {
                bgColor: "orange.subtle",
                color: "orange.fg",
                borderColor: "orange.emphasized",
                "--toast-trigger-bg": "colors.orange.muted",
            },
        },
        title: {
            fontWeight: "semibold",
            textStyle: "sm",
            marginEnd: "2",
        },
        description: {
            textStyle: "sm",
            "& p": {
                marginBlock: 2,
            },
        },
        indicator: {
            flexShrink: "0",
            boxSize: "5",
        },
        actionTrigger: {
            textStyle: "sm",
            fontWeight: "medium",
            height: "8",
            px: "3",
            alignSelf: "center",
            borderRadius: "l2",
            borderWidth: "1px",
            borderColor: "{currentColor/40}",
            transition: "background 200ms",
            _hover: { bgColor: "var(--toast-trigger-bg)" },
        },
        closeTrigger: {
            position: "absolute",
            top: "1",
            insetEnd: "1",
            padding: "1",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "{currentColor/60}",
            borderRadius: "l2",
            textStyle: "md",
            transition: "background 200ms",
            _hover: { bgColor: "var(--toast-trigger-bg)" },
            _icon: { boxSize: "1em" },
        },
    },
})
