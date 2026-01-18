import { chakra } from "@chakra-ui/react"
import type { ComponentProps, ReactNode } from "react"
import { Tooltip } from "."

// from the chakra ui button recipe
// https://github.com/chakra-ui/chakra-ui/blob/main/packages/react/src/theme/recipes/button.ts

const Base = chakra("button", {
    base: {
        color: "fg.3",
        aspectRatio: "1",
        bgColor: "transparent",
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
        cursor: "button",
        flexShrink: "0",
        outline: "0",
        lineHeight: "1.2",
        isolation: "isolate",
        fontWeight: "medium",
        transitionProperty: "common",
        transitionDuration: "moderate",
        focusVisibleRing: "outside",
        _hover: {
            scale: "1.2",
            color: "fg.1",
        },
        _disabled: {
            layerStyle: "disabled",
            cursor: "default",
        },
        _icon: {
            flexShrink: "0",
        },
    },

    variants: {
        variant: {
            toggle: {
                paddingBlock: 0.5,
                height: "unset",
                paddingInline: 1,
                border: "1px solid",
                borderColor: "transparent",
                borderRadius: 0,
                margin: 0,
                marginInline: "-0.5px",
                _hover: {
                    scale: "1",
                    color: "fg.1",
                    "& *": {
                        scale: 1.05,
                    },
                },
                "& *": {
                    transformOrigin: "center center",
                },
                "&:first-child": {
                    borderTopLeftRadius: "md",
                    borderBottomLeftRadius: "md",
                    marginLeft: 0,
                },
                "&:last-child": {
                    borderTopRightRadius: "md",
                    borderBottomRightRadius: "md",
                    marginRight: 0,
                },
            },
        },
        toggled: {
            true: {
                bgColor: "bg.3",
                border: "1px solid {gray/30}",
                color: "fg.1",
            },
            false: {
                color: "fg.3",
                bgColor: "bg.deep",
                border: "1px solid {gray/30}",
            },
        },
        size: {
            min: {
                h: "min-content",
                minH: 0,
                w: "min-content",
                minW: 0,
                textStyle: "xs",
                _icon: {
                    width: "5",
                    height: "5",
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
                px: "4",
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

    defaultVariants: {
        size: "sm",
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
            <Tooltip tip={tip} tipTitle={tipTitle} tipText={tipText}>
                {button}
            </Tooltip>
        )
    }

    return button
}

export default IconButton
