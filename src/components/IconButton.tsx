import { chakra } from "@chakra-ui/react"
import type { ComponentProps, ReactNode } from "react"
import { Tooltip } from "."

// from the chakra ui button recipe
// https://github.com/chakra-ui/chakra-ui/blob/main/packages/react/src/theme/recipes/button.ts

const Base = chakra("button", {
    base: {
        margin: 0,
        height: "min-content",
        paddingY: 2,
        color: "fg.3",
        aspectRatio: "1",
        background: "transparent",
        display: "inline-flex",
        appearance: "none",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        position: "relative",
        borderRadius: "l2",
        whiteSpace: "nowrap",
        verticalAlign: "middle",
        borderWidth: "1px",
        borderColor: "transparent",
        overflow: "visible",
        // cursor: "button",
        flexShrink: "0",
        outline: "0",
        // lineHeight: "1.2",
        isolation: "isolate",
        fontWeight: "medium",
        transitionProperty: "common",
        transitionDuration: "moderate",
        focusVisibleRing: "outside",
        transformOrigin: "center center",
        "& *": {
            transformOrigin: "center center",
        },
        _disabled: {
            layerStyle: "disabled",
            cursor: "default",
            pointerEvents: "none",
            _hover: { scale: 1 },
        },
        _hover: {
            color: "fg.2",
            background: "var(--hover-bg)",
            borderColor: "var(--hover-border)",
            boxShadow: "var(--hover-shadow)",
        },
        _expanded: {
            background: "var(--hover-bg)",
            borderColor: "var(--hover-border)",
            boxShadow: "var(--hover-shadow)",
        },
        _icon: {},
        _focusVisible: {
            outline: "none",
        },
        "--hover-bg": "{colors.bg.0/50}",
        "--hover-shadow": "0px 0px 4px -2px #00000088",
        "--hover-border": "transparent",
        "--tb-open-color": "{colors.info}",
    },

    variants: {
        variant: {
            ghost: {
                background: "transparent",
                border: "none",
            },
            inset: {
                background: "bg.1",
                border: "1px solid {gray/30}",
                color: "fg.1",
                paddingBlock: 0.5,
                height: "unset",
                // paddingInline: 1,
                // border: "1px solid",
                // borderColor: "transparent",
                borderRadius: "md",
                margin: 0,
                marginInline: "-0.5px",
                _hover: {
                    color: "fg.1",
                    scale: "1",
                    "& *": {
                        scale: 1.05,
                    },
                },
                "& *": {
                    transformOrigin: "center center",
                },
            },
            simple: {
                "& > *": {
                    scale: 1,
                },
                _after: {
                    scale: 1.1,
                },
                _hover: {
                    "& > *": {
                        scale: 1.1,
                    },
                    _after: {
                        scale: 1.1,
                    },
                },
            },
            toggle: {
                paddingBlock: 0.5,
                height: "unset",
                paddingInline: 4,
                border: "1px solid",
                borderColor: "transparent",
                borderRadius: 0,
                margin: 0,
                marginInline: "-0.5px",
                _hover: {
                    scale: "1",
                    "& *": {
                        scale: 1.05,
                    },
                },
                "& *": {
                    transformOrigin: "center center",
                },
                "&:first-of-type": {
                    borderTopLeftRadius: "md",
                    borderBottomLeftRadius: "md",
                    marginLeft: 0,
                },
                "&:last-of-type": {
                    borderTopRightRadius: "md",
                    borderBottomRightRadius: "md",
                    marginRight: 0,
                },
            },
            toolbar: {
                "--hover-shadow": "none",
                "--hover-bg": "none",
                color: "fg.1",
                _hover: {
                    color: "fg.1",
                },
                transition: "all 0.2s ease",
                // _after: {
                //     content: '""',
                //     position: "absolute",
                //     border: "0px solid var(--tb-open-color)",
                //     borderTopWidth: "3px",
                //     // borderBottomWidth: "2px",
                //     inset: "-1px",
                //     opacity: 0,
                //     transition: "opacity 1000ms ease",
                //     // transition: "none",
                //     zIndex: 0
                // },
                "& > *": {
                    zIndex: 1,
                },
            },
        },
        tbActive: {
            true: {
                color: "fg.1",
                _hover: {
                    color: "fg.1",
                },
            },
            false: {
                opacity: 0.7,
                _hover: {
                    color: "fg.1",
                    // borderColor: "grayc.13",
                },
            },
        },
        tbOpen: {
            true: {
                // _after: {
                //     opacity: 1,
                // },
            },
            false: {},
        },
        tone: {
            danger: {
                background: "color-mix(in srgb, {colors.bg.1} 70%, {colors.red.500} 30%)",
                "--hover-bg": "color-mix(in srgb, {colors.bg.1} 60%, {colors.red.500} 40%)",
                "--hover-border": "{colors.red.500/40}",
                "--hover-shadow": "0px 1px 5px -3px #00000055",
            },
            success: {
                color: "grayc.2",
                fontWeight: "600",
                background: "color-mix(in srgb, {colors.grayc.15} 80%, {colors.success.1} 20%)",
                border: "2px solid {colors.success.1}",
                "--hover-bg": "{colors.success.1/90}",
                "--hover-border": "{colors.success.1}",
                "--hover-shadow": "0px 1px 5px -3px #00000055",
            },
            none: {
                // "--hover-bg": "{colors.bg.0/50}",
                // "--hover-shadow": "0px 0px 4px -2px #00000088",
                // "--hover-border": "transparent",
            },
            selected: {
                color: "white",
                fontWeight: "600",
                background: "highlight.1",
                "--hover-bg": "{colors.highlight}",
            },
            active: {
                color: "{colors.fg.1}",
                fontWeight: "600",
                background: "{colors.bg.3}",
                boxShadow: "0px 0px 4px -2px #00000088",
                "--hover-bg": "{colors.bg.0/50}",
                "--hover-shadow": "0px 0px 4px -2px #00000088",
                "--hover-border": "transparent",
                _hover: {
                    color: "fg.1",
                },
            },
            info: {
                color: "white",
                fontWeight: "600",
                background: "info.1",
                "--hover-bg": "{colors.info}",
            },
        },
        toggled: {
            true: {
                background: "bg.2",
                border: "1px solid {gray/30}",
                color: "fg.1",
                _hover: {
                    color: "fg.1",
                },
                // boxShadow: "0px 0px 5px 0px #c958286d inset"
            },
            false: {
                color: "fg.3/70",
                background: "bg.deep",
                border: "1px solid {gray/30}",
                _hover: {
                    color: "fg.3",
                },
            },
        },
        strike: {
            true: {
                position: "relative",
                _after: {
                    content: '""',
                    position: "absolute",
                    background: "currentColor",
                    height: "0.15em",
                    width: "75%",
                    transform: "rotate(45deg)",
                },
            },
            false: {},
        },
        size: {
            min: {
                h: "min-content",
                minH: 0,
                w: "min-content",
                minW: 0,
                textStyle: "xs",
                _icon: {
                    width: "4",
                    height: "4",
                },
            },
            "2xs": {
                h: "6",
                minW: "6",
                textStyle: "xs",
                px: "2",
                gap: "1",
                _icon: {
                    width: "3.5",
                    height: "3.5",
                    gap: "1.5",
                },
            },
            xs: {
                h: "8",
                minW: "8",
                textStyle: "xs",
                px: "2.5",
                gap: "1",
                _icon: {
                    width: "4",
                    height: "4",
                },
            },
            sm: {
                h: "8",
                minW: "8",
                px: "0",
                textStyle: "sm",
                gap: "2",
                _icon: {
                    width: "5",
                    height: "5",
                },
            },
            md: {
                h: "10",
                minW: "10",
                textStyle: "sm",
                px: "0",
                gap: "2",
                _icon: {
                    width: "6",
                    height: "6",
                },
            },
            lg: {
                h: "11",
                minW: "11",
                textStyle: "md",
                px: "5",
                gap: "3",
                _icon: {
                    width: "5",
                    height: "5",
                },
            },
            xl: {
                h: "12",
                minW: "12",
                textStyle: "md",
                px: "5",
                gap: "2.5",
                _icon: {
                    width: "5",
                    height: "5",
                },
            },
            "2xl": {
                h: "16",
                minW: "16",
                textStyle: "lg",
                px: "7",
                gap: "3",
                _icon: {
                    width: "6",
                    height: "6",
                },
            },
        },
    },

    compoundVariants: [
        {
            tbActive: true,
            tone: "info",
            css: {
                background: "color-mix(in srgb, {colors.info.1} 50%, {colors.bg.0} 50%)",
            },
        },
        {
            tbActive: undefined,
            tbOpen: true,
            css: {
                _after: {
                    bgColor: "grayc.12/50",
                },
            },
        },
        {
            variant: "ghost",
            toggled: true,
            css: {
                background: "unset",
                border: "none",
                color: "fg.1",
                _hover: {
                    color: "fg.1",
                },
            },
        },
        {
            variant: "ghost",
            toggled: false,
            css: {
                background: "unset",
                border: "none",
                color: "fg.3/70",
                _hover: {
                    color: "fg.1",
                },
            },
        },
        {
            strike: true,
            size: "sm",
            css: {
                _after: {
                    width: "75%",
                },
            },
        },
        {
            strike: true,
            size: "xs",
            css: {
                _after: {
                    width: "60%",
                },
            },
        },
    ],

    defaultVariants: {
        tone: "none",
        variant: "simple",
        size: "sm",
        strike: false,
    },
})

export interface IconButtonProps extends ComponentProps<typeof Base> {
    tip?: ReactNode
    tipTitle?: string
    tipText?: string
}

const IconButton = (props: IconButtonProps) => {
    const { tip, tipTitle, tipText, children, ...rest } = props

    const button = <Base {...rest}>{children}</Base>

    if (tip || tipTitle || tipText) {
        return (
            <Tooltip tip={tip} tipTitle={tipTitle} tipText={tipText} whiteSpace={"normal"}>
                {button}
            </Tooltip>
        )
    }

    return button
}

export default IconButton
