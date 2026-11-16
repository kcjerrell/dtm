import { chakra } from "@chakra-ui/react"
import type { ComponentProps, PropsWithChildren } from "react"
import { MotionBox } from "../common"
import Tooltip from "../Tooltip"
import { ToolbarSectionContext } from "./ToolbarSection"

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
        itemId,
        isSelected,
        isActive,
        isOpen,
        isWaiting,
        tip,
        tipTitle,
        tipText,
        ...restProps
    } = props

    const [, { activeItemLayoutId, mode }] = ToolbarSectionContext.useContext()
    // const hv = ToolbarSectionContext.useContextHooks()

    const showIndicator = isActive || isOpen || isWaiting

    return (
        <TooltipWrapper tip={tip} tipText={tipText} tipTitle={tipTitle}>
            <Base
                tbSelected={isSelected}
                tbIndicator={showIndicator}
                css={{
                    "--tb-indicator-color": getIndicatorColor(
                        isSelected,
                        isActive,
                        isOpen,
                        isWaiting,
                    ),
                    "& > *": {
                        zIndex: 5,
                    },
                }}
                {...restProps}
            >
                <SelectedIndicator
                    name={activeItemLayoutId}
                    {...{ mode, isSelected, showIndicator }}
                />
                {children}
            </Base>
        </TooltipWrapper>

        /*{mode === "select" && isSelected && (
                <SelectedIndicator name={activeItemLayoutId} show={true} />
            )}*/
    )
}

function SelectedIndicator(props) {
    const { name, isSelected, showIndicator, mode } = props
    if (!isSelected && !showIndicator) return null

    return (
        <MotionBox
            layoutId={mode === "select" ? name : undefined}
            layout={mode === "select" ? "position" : false}
            className={"indicator"}
            aria-hidden="true"
            pointerEvents="none"
            position="absolute"
            zIndex={0}
            border="0px solid {var(--tb-indicator-color)}"
            borderTopWidth="3px"
            borderBottomWidth="3px"
            borderLeft={"1px solid {colors.grayc.12}"}
            borderRight={"1px solid {colors.grayc.12}"}
            inset="-2px -1px -2px -1px"
            boxShadow={"pane0"}
            bgColor={"#ffffff44"}
            _dark={{
                bgColor: "#ffffff11",
            }}
            // backgroundColor="grayc.12/50"
            // _dark={{ backgroundColor: "grayc.13/50" }}
        />
    )
}

type TooltipWrapperProps = Pick<ComponentProps<typeof Tooltip>, "tip" | "tipTitle" | "tipText">
function TooltipWrapper(props: PropsWithChildren<TooltipWrapperProps>) {
    const { tip, tipTitle, tipText, children } = props

    if (tip || tipTitle || tipText) {
        return (
            <Tooltip
                tip={tip}
                tipTitle={tipTitle}
                tipText={tipText}
                // ids={restProps.id ? { trigger: restProps.id } : undefined}
                whiteSpace="normal"
            >
                {children}
            </Tooltip>
        )
    }

    return children
}

function getIndicatorColor(
    isSelected?: boolean,
    isActive?: boolean,
    isOpen?: boolean,
    isWaiting?: boolean,
) {
    if (isSelected) return "{colors.highlight.1}"
    if (isOpen) return "{colors.info}"
    if (isActive) return "#ffd740"
    if (isWaiting) return "{colors.success.1}"
    return "transparent"
}

const Base = chakra("button", {
    base: {
        // boxSizing: "content-box",

        display: "flex",
        position: "relative",
        appearance: "none",
        overflow: "visible",

        margin: 0,
        paddingY: 0,
        height: "min-content",
        aspectRatio: "1",
        flexShrink: "0",

        justifyContent: "center",
        alignItems: "center",
        verticalAlign: "middle",

        focusVisibleRing: "outside",
        transformOrigin: "center center",
        userSelect: "none",
        whiteSpace: "nowrap",
        fontWeight: "medium",

        background: "transparent",
        color: "grayc.3",
        borderRadius: "0",
        borderWidth: "0px",
        borderColor: "transparent",
        outline: "0",

        //         _first: {
        //             borderLeft: "1px solid {colors.grayc.12}",
        //         },
        //
        //         _last: {
        //             borderRight: "1px solid {colors.grayc.12}",
        //         },

        // _dark: {
        //     _first: {
        //         borderLeft: "1px solid {colors.grayc.15}",
        //     },
        //     _last: {
        //         borderRight: "1px solid {colors.grayc.15}",
        //     },
        // },

        transitionProperty: "background-color, border-color, color",
        transitionDuration: "0.2s",

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

        // _after: {
        //     content: '""',
        //     display: "block",
        //     position: "absolute",
        //     backgroundColor: "var(--tb-indicator-color)/0",
        //     top: "-5px",
        //     left: 0,
        //     right: 0,
        //     bottom: "-5px",
        //     // height: "150%",
        //     transition: "all 0.2s ease",
        // },
    },

    variants: {
        tbSelected: {
            true: {
                color: "grayc.2",
                _dark: {
                    color: "grayc.2",
                },
                // // borderColor: "grayc.8",
                // borderTopColor: "highlight.1",
                // borderBottomColor: "highlight.1",
                // // transform: "translateY(-3px)"
                // transform: "scale(1)"
            },
            false: {
                color: "grayc.5",
                _dark: {
                    color: "grayc.5",
                },
                // "& > *": {
                //     transform: "scale(0.9)"
                // }
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
                    width: "round(1rem, 2px)",
                    height: "round(1rem, 2px)",
                },
            },
            "2xs": {
                h: "6",
                minW: "6",
                textStyle: "xs",
                px: "2",
                gap: "1",
                _icon: {
                    width: "round(0.875rem, 2px)",
                    height: "round(0.875rem, 2px)",
                },
            },
            xs: {
                h: "8",
                minW: "8",
                textStyle: "xs",
                px: "2.5",
                gap: "1",
                _icon: {
                    width: "round(1rem, 2px)",
                    height: "round(1rem, 2px)",
                },
            },
            sm: {
                h: "8",
                minW: "8",
                px: "0",
                textStyle: "sm",
                gap: "2",
                fontSize: "18px",
                _icon: {
                    width: "round(1.25rem, 2px)",
                    height: "round(1.25rem, 2px)",
                },
            },
            md: {
                h: "10",
                minW: "10",
                textStyle: "sm",
                px: "0",
                gap: "2",
                _icon: {
                    width: "round(1.5rem, 2px)",
                    height: "round(1.5rem, 2px)",
                },
            },
            lg: {
                h: "11",
                minW: "11",
                textStyle: "md",
                px: "5",
                gap: "3",
                _icon: {
                    width: "round(1.25rem, 2px)",
                    height: "round(1.25rem, 2px)",
                },
            },
            xl: {
                h: "12",
                minW: "12",
                textStyle: "md",
                px: "5",
                gap: "2.5",
                _icon: {
                    width: "round(1.25rem, 2px)",
                    height: "round(1.25rem, 2px)",
                },
            },
            "2xl": {
                h: "16",
                minW: "16",
                textStyle: "lg",
                px: "7",
                gap: "3",
                _icon: {
                    width: "round(1.5rem, 2px)",
                    height: "round(1.5rem, 2px)",
                },
            },
        },
    },

    defaultVariants: {
        size: "sm",
    },
})

export default ToolbarButton
