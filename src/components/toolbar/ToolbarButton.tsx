import { Box, chakra } from "@chakra-ui/react"
import type { ComponentProps } from "react"
import { MotionBox } from "../common"
import Tooltip from "../Tooltip"
import { ToolbarSectionContext } from "./ToolbarSection"
import { AnimatePresence, motion } from "motion/react"

export interface ToolbarButtonProps
    extends ComponentProps<typeof Base>,
        Pick<ComponentProps<typeof Tooltip>, "tip" | "tipTitle" | "tipText"> {
    itemId: string
    /**
     * This is the selected item in a select group. Should only be one. Will render the selected item indicator
     * and animate from previous selected item
     */
    isSelected?: boolean
    /** indicates an ongoing state or process. For toggleable buttons. Will show yellow indicator */
    isActive?: boolean
    /** indicates a separate UI is open associated with this button. will show blue indicator */
    isOpen?: boolean
    /** indicates this item is awaiting input or will receive the next action. Will show green indicator. */
    isWaiting?: boolean
}

function ToolbarButton(props: ToolbarButtonProps) {
    const {
        children,
        itemId: _itemId,
        isSelected,
        isActive,
        isOpen,
        isWaiting,
        tip,
        tipTitle,
        tipText,
        ...restProps
    } = props

    const [, { activeItemLayoutId }] = ToolbarSectionContext.useContext()

    const showIndicator = isActive || isOpen || isWaiting

    const button = (
        <Base
            tbSelected={isSelected}
            tbIndicator={showIndicator}
            css={{ "--tb-indicator-color": getIndicatorColor(isActive, isOpen, isWaiting) }}
            {...restProps}
        >
            {children}
            {isSelected && (
                <Box
                    className={"indicator"}
                    aria-hidden="true"
                    pointerEvents="none"
                    position="absolute"
                    border="0px solid {colors.highlight.1}"
                    borderTopWidth="3px"
                    borderBottomWidth="0px"
                    inset="-2px 0px 0px 0px"
                    backgroundColor="grayc.12/50"
                    _dark={{ backgroundColor: "grayc.13/50" }}
                    zIndex={-1}
                    asChild
                >
                    <motion.div
                        transition={{ layout: { duration: 0.2 } }}
                        layout={"x"}
                        layoutId={activeItemLayoutId}
                    />
                </Box>
            )}
        </Base>
    )

    if (tip || tipTitle || tipText) {
        return (
            <Tooltip
                tip={tip}
                tipTitle={tipTitle}
                tipText={tipText}
                ids={restProps.id ? { trigger: restProps.id } : undefined}
                whiteSpace="normal"
            >
                {button}
            </Tooltip>
        )
    }

    return button
}

function getIndicatorColor(isActive?: boolean, isOpen?: boolean, isWaiting?: boolean) {
    if (isOpen) return "{colors.info}"
    if (isActive) return "#ffd740"
    if (isWaiting) return "{colors.success.1}"
    return "transparent"
}

const Base = chakra("button", {
    base: {
        display: "flex",
        position: "relative",
        appearance: "none",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        overflow: "visible",
        flexShrink: "0",

        height: "min-content",
        aspectRatio: "1",
        margin: 0,
        paddingY: 0,

        focusVisibleRing: "outside",
        transformOrigin: "center center",

        userSelect: "none",
        whiteSpace: "nowrap",

        fontWeight: "medium",
        background: "transparent",
        color: "grayc.3",
        borderRadius: "l2",
        borderWidth: "1px",
        borderColor: "transparent",
        outline: "0",

        transitionProperty: "background-color, border-color, color",
        transitionDuration: "0.2s",

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
            color: "grayc.1",
        },

        _expanded: {},

        _icon: {},

        _focusVisible: {
            outline: "none",
        },
        "--tb-open-color": "{colors.info}",

        _after: {
            content: '""',
            display: "block",
            position: "absolute",
            backgroundColor: "var(--tb-indicator-color)/0",
            top: "-2px",
            left: 0,
            right: 0,
            height: "3px",
            transition: "all 0.2s ease",
        },
    },

    variants: {
        tbSelected: {
            true: {
                color: "grayc.2",
                _dark: {
                    color: "grayc.3",
                },
            },
            false: {
                color: "grayc.5",
                _dark: {
                    color: "grayc.7",
                },
            },
        },
        tbIndicator: {
            true: {
                _after: {
                    backgroundColor: "var(--tb-indicator-color)/100",
                },
            },
            false: {
                _after: {
                    backgroundColor: "var(--tb-indicator-color)/0",
                },
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

    defaultVariants: {
        size: "sm",
    },
})

export default ToolbarButton
