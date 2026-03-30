import { cs } from "@/utils/helpers"
import { Button, chakra } from "@chakra-ui/react"
import { motion } from "motion/react"

export const MotionBox = chakra(motion.div, {}, { forwardProps: ["transition"] })

export const Panel = chakra("div", {
    base: {
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        justifyContent: "flex-start",
        padding: 2,

        backgroundColor: "bg.1",
    },
    variants: {
        glass: {
            true: {
                bgColor: "transparent",
                backdropFilter: "blur(8px)",
            },
        },
        variant: {
            float: {
                borderRadius: "lg",
                boxShadow: "pane1",
            },
            fixed: {},
        },
    },
    defaultVariants: { variant: "float" },
})

export const CheckRoot = chakra(
    motion.div,
    {
        base: {
            display: "flex",
            // bgImage: "url(check_light.png)",
            // bgSize: "50px 50px",
            // bgColor: "#000000",
            bgColor: "transparent",
            width: "100%",
            height: "100%",
            overscrollBehavior: "none none",
            position: "relative",
            borderRadius: "md",
            zIndex: 0,
            _before: {
                content: '""',
                bgImage: "url(check_light.png)",
                position: "absolute",
                width: "100%",
                height: "100%",
                bgSize: "50px 50px",
                inset: 0,
                pointerEvents: "none",
                zIndex: -2,
            },
        },
        variants: {
            variant: {
                attached: {
                    zIndex: 2,
                    boxShadow: cs(
                        // "0px 0px 5px -1px #00000022",
                        "0px 3px 12px -3px #00000022",
                        // "-2px 0px 6px -2px #FF000000 inset",
                    ),
                    borderRadius: "lg",
                },
                float: {
                    zIndex: 0,
                },
            },
            dark: {
                true: {
                    _after: {
                        content: '""',
                        bgImage: "url(check_dark.png)",
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        bgSize: "50px 50px",
                        inset: 0,
                        animation: "fadeIn 0.2s ease forwards",
                        pointerEvents: "none",
                        zIndex: -1,
                    },
                },
                false: {
                    _after: {
                        content: '""',
                        bgImage: "url(check_dark.png)",
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        bgSize: "50px 50px",
                        inset: 0,
                        animation: "fadeOut 0.2s ease forwards",
                        pointerEvents: "none",
                        zIndex: -1,
                    },
                },
            },
        },
        defaultVariants: { variant: "float" },
    },
    { forwardProps: ["transition"] },
)

export const PaneListContainer = chakra("div", {
    base: {
        position: "relative",

        height: "auto",
        maxHeight: "100%",
        width: "100%",
        color: "fg.2",
        flex: "1 0 auto",

        paddingY: 0,
        paddingX: 0,
        borderRadius: "sm",
        gap: 0.5,
        display: "flex",
        justifyContent: "flex-start",
        alignItems: "stretch",
        flexDirection: "column",
        overscrollBehavior: "contain",
        overflowY: "clip",
    },
    variants: {
        variant: {
            inset: {
                borderBlock: "0.25rem solid {colors.bg.1}",
            },
            flat: {},
        },
    },
})

export const PaneListScrollContainer = chakra(
    "div",
    {
        base: {
            position: "relative",
            width: "100%",
            paddingY: "1px",
            gap: 0,
            display: "flex",
            justifyContent: "flex-start",
            alignItems: "stretch",
            flexDirection: "column",
            overscrollBehavior: "contain",
            scrollBehavior: "smooth",
            overflowY: "auto",
        },
        variants: {
            variant: {
                inset: {
                    bgColor: "bg.deep/30",
                },
                flat: {},
            },
        },
    },
    { defaultProps: { className: "panel-scroll-square" } },
)

export const PanelListScrollContent = chakra("div", {
    base: {
        height: "auto",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        alignItems: "stretch",
        gap: 0,
    },
    variants: {
        variant: {
            inset: {
                bgColor: "bg.deep/50",
            },
            flat: {},
        },
    },
})

export const PanelSectionHeader = chakra("h3", {
    base: {
        paddingX: 2,
        fontWeight: "600",
        color: "fg.2",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flex: "0 0 auto",
    },
    variants: {
        variant: {
            inset: {},
            flat: {},
        },
    },
})

export const PanelListItem = chakra(
    "div",
    {
        base: {
            color: "fg.2",
            paddingX: 3,
            paddingY: 1,
            border: "1px solid transparent",
            transition: "all 0.2s ease-out",
            _focusVisible: {
                outline: "1px inset {colors.blue.400/70} !important",
            },
            willChange: "transform",
            contain: "paint",
        },
        variants: {
            variant: {
                inset: {},
                flat: {},
            },
            selectable: {
                true: {
                    // _hover: {
                    //     bgColor: "color-mix(in srgb, {colors.bg.3} 50%, {colors.bg.0} 50%)",
                    //     transition: "all 0.05s ease-out",
                    // },

                    "&[data-selected]:not([data-selected] + [data-selected])": {
                        borderTopColor: "fg.2/10",
                        borderTopRadius: "lg",
                    },

                    "&[data-selected]:not(:has(+ [data-selected]))": {
                        borderBottomColor: "fg.2/10",
                        borderBottomRadius: "lg",
                    },
                },
            },
            selected: {
                true: {
                    // bgColor: "color-mix(in srgb, {colors.bg.2} 95%, {colors.info} 5%)",
                    // bgColor: "color-mix(in srgb, {colors.bg.1} 50%, {colors.bg.2} 50%)",
                    // bgColor: "grayc.13",
                    bgColor: "#c8d4dfff",
                    borderLeftColor: "fg.2/10",
                    borderRightColor: "fg.2/10",
                    color: "fg.1",
                    _dark: {
                        bgColor: "#323f50ff",
                        color: "fg.1",
                    },
                },
                false: {
                    // _dark: {
                    //     bgColor: "bg.2",
                    // },
                },
            },
            hoverScale: {
                true: {
                    _hover: {
                        transform: "scale(1.01)",
                    },
                },
            },
        },
    },
    { defaultProps: { tabIndex: 0 } },
)

export const PanelButton = chakra(
    Button,
    {
        base: {
            bgColor: "bg.3",
            margin: 0,
            color: "fg.2",
            height: "min-content",
            paddingY: 2,
            fontWeight: "500",
            boxShadow: "0px 1px 5px -3px #00000055",
            _disabled: {
                cursor: "default",
            },
        },
        variants: {
            tone: {
                danger: {
                    bgColor: "color-mix(in srgb, {colors.bg.1} 70%, {colors.red.500} 30%)",
                    _hover: {
                        bgColor: "color-mix(in srgb, {colors.bg.1} 60%, {colors.red.500} 40%)",
                        border: "1px solid {colors.red.500/40}",
                        boxShadow: "0px 1px 5px -3px #00000055",
                    },
                },
                success: {
                    color: "grayc.2",
                    fontWeight: "600",
                    bgColor: "color-mix(in srgb, {colors.grayc.15} 80%, {colors.success.1} 20%)", // "color-mix(in srgb, {colors.bg.1} 70%, {colors.green.500} 30%)",
                    border: "2px solid {colors.success.1}",
                    _hover: {
                        bgColor: "success.1/90",
                        // bgColor: "color-mix(in srgb, {colors.bg.1} 20%, {colors.highlight} 80%)",
                        border: "2px solid {colors.success.1}",
                        boxShadow: "0px 1px 5px -3px #00000055",
                    },
                },
                none: {
                    _hover: {
                        // border: "1px solid {colors.fg.2/20}",
                        boxShadow: "0px 0px 4px -2px #00000088",
                        bgColor: "bg.0",
                    },
                },
                selected: {
                    color: "white",
                    fontWeight: "600",
                    bgColor: "highlight.1",
                    _hover: {
                        bgColor: "highlight",
                    },
                },
            },
        },
        defaultVariants: { tone: "none" },
    },
    { defaultProps: { size: "sm", variant: "subtle" } },
)

export const PanelSection = chakra("div", {
    base: {
        display: "flex",
        flexDirection: "column",
        padding: 0.5,
        overflowY: "clip",
        overflowX: "clip",
        alignItems: "stretch",
        justifyContent: "flex-start",
        gap: "1px",
        color: "fg.2",
    },
    variants: {
        variant: {
            inset: {
                bgColor: "bg.1",
                boxShadow: "0px 1px 8px -4px #00000044",
                borderRadius: "lg",
                border: "1px solid",
                borderColor: "grayc.10",
                _dark: {
                    borderColor: "grayc.14",
                },
            },
            flat: {},
            dialog: {
                bgColor: "bg.2/50",
                borderRadius: "lg",
                border: "1px solid",
                borderColor: "grayc.10",
                _dark: {
                    borderColor: "grayc.14",
                },
            },
        },
    },
})

export const LinkButton = chakra("button", {
    base: {
        color: "info",
        fontWeight: "600",
        _hover: {
            textDecoration: "underline",
        },
        cursor: "pointer",
    },
    variants: {
        show: {
            true: {
                display: "inline",
            },
            false: {
                display: "none",
            },
        },
    },
})

export const AppRoot = chakra("div", {
    base: {
        display: "flex",
        flexDirection: "row",
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        alignItems: "stretch",
        justifyContent: "stretch",
        cursor: "default",
        userSelect: "none",
        gap: 0,
        bgColor: "grayc.14",
        transformOrigin: "left top",
    },
})
