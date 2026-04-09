import { chakra, HStack, IconButton, Spacer, VStack } from "@chakra-ui/react"
import type { ComponentProps, PropsWithChildren } from "react"
import { useSnapshot } from "valtio"
import { FaMinus, FaMoon, FaPlus } from "@/components/icons/icons"
import { toggleColorMode } from "@/components/ui/color-mode"
import AppStore from "@/hooks/appState"
import UpgradeButton from "@/metadata/toolbar/UpgradeButton"
import { themeHelpers } from "@/theme/helpers"
import { cs } from "@/utils/helpers"
import Tooltip from "../Tooltip"

const Root = chakra(
    "nav",
    {
        base: {
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            alignItems: "stretch",
            gap: 0,
            paddingTop: "30px",
            bgColor: "grayc.14",
            _dark: {
                bgColor: "grayc.17",
            },
            flex: "0 0 auto",
            width: "68px",
            marginLeft: "0px",
            transition: "all 0.4s ease",
        },
        variants: {
            hidden: {
                true: {
                    marginLeft: "-60px",
                    "& > *:not([aria-selected='true'])": {
                        borderRightColor: "grayc.10",
                    },
                    _hover: {
                        transform: "translateX(8px)",
                        "& > *:not([aria-selected='true'])": {
                            borderRightColor: "grayc.10",
                        },
                    },
                },
            },
            variant: {
                attached: {
                    zIndex: "unset",
                    borderRadius: "none",
                    boxShadow: cs("0px 0px 2px -1px #00000000", "0px 3px 12px -3px #00000000"),
                },
                float: {
                    zIndex: 2,
                    borderRadius: "lg",
                    boxShadow: cs("0px 0px 5px -1px #00000055", "0px 3px 12px -3px #00000055"),
                },
            },
        },
        defaultVariants: {
            variant: "float",
        },
        compoundVariants: [
            {
                variant: "attached",
                hidden: true,
                css: {
                    zIndex: 3,
                    borderRight: "1px solid {colors.grayc.10}",
                },
            },
        ],
    },
    {},
)

export type SidebarVariant = "attached" | "float"

interface SidebarProps extends PropsWithChildren<ComponentProps<typeof Root>> {}
function SidebarComponent(props: SidebarProps) {
    const { children, ...rest } = props
    const { isSidebarVisible } = useSnapshot(AppStore.store)
    const { showSidebar } = AppStore

    return (
        <Root
            data-solid
            className={"group"}
            hidden={!isSidebarVisible}
            onClick={() => showSidebar(!isSidebarVisible)}
            {...rest}
        >
            {children}
        </Root>
    )
}

const ButtonBase = chakra("button", {
    base: {
        paddingY: "8px",
        display: "flex",
        gap: "5px",
        flexDirection: "column",
        alignItems: "center",
        transition: "all 0.2s ease-in-out",
        fontSize: "xs",
        color: "fg.3",
        border: "1px solid transparent",
        borderRight: "3px solid transparent",
        fontWeight: "500",
        borderRadius: "0",
        _focus: {},
        _focusVisible: {
            outline: "1px solid",
            outlineColor: "grayc.4/50",
            outlineOffset: "-1px",
            bgColor: "bg.0/50",
        },
    },
    variants: {
        isActive: {
            true: {
                color: "highlight",
                borderRightColor: "highlight",
                fontWeight: "600",
            },
        },
        popout: {
            true: {
                my: "4px",
                py: "4px",
                "&>*": {
                    opacity: 0,
                    transitionDelay: "0.25s",
                    transitionProperty: "opacity",
                },
                transition: "all 0.5s ease-out",

                _hover: {
                    transform: "translateX(50px) !important",
                    bgColor: "inherit",
                    transition: "all 0.2s ease-in-out",
                    boxShadow: "pane1",
                    "&>*": {
                        opacity: 1,
                        transitionDelay: "0s",
                        transitionProperty: "opacity",
                    },
                },
            },
            false: {
                _hover: {
                    bgColor: "bg.0/50",
                },
            },
        },
        update: {
            true: {
                borderRightColor: "#66a676ff !important",
            },
            false: {},
        },
        updating: {
            true: {
                _hover: { bgColor: "none" },
            },
            false: {},
        },
    },
    compoundVariants: [
        {
            updating: true,
            popout: true,
            css: {
                // transform: "translateX(50px) !important",
                bgColor: "inherit",
                boxShadow: "pane1",
                "&>*": {
                    opacity: 1,
                },
            },
        },
    ],
})

const ButtonContent = chakra("div", {
    base: {
        aspectRatio: 1,
        margin: "auto",
        width: "20px",
        height: "20px",
    },
})

const ButtonLabel = chakra("div", {
    base: {
        fontSize: "xs",
        flex: "0 0 min-content",
    },
})

interface SidebarButtonProps extends ComponentProps<typeof ButtonBase> {
    item: {
        viewId: string
        label: string
        icon: React.FC | null
    }
    isActive?: boolean
    isUpgrade?: boolean
}

export function SidebarButton(props: SidebarButtonProps) {
    const { item, onClick, isActive = false, isUpgrade = false, ref, children, ...rest } = props
    const { label, icon: Icon } = item
    const { isSidebarVisible } = useSnapshot(AppStore.store)

    return (
        <ButtonBase
            ref={ref}
            aria-current={isActive ? "page" : undefined}
            aria-selected={isActive || undefined}
            isActive={isActive}
            popout={!isSidebarVisible}
            update={isUpgrade}
            onClick={(e) => {
                e.stopPropagation()
                onClick?.(e)
            }}
            {...rest}
        >
            {Icon ? (
                <>
                    <ButtonContent asChild>
                        <Icon />
                    </ButtonContent>
                    <ButtonLabel>{label}</ButtonLabel>
                </>
            ) : (
                children
            )}
        </ButtonBase>
    )
}

export function ColorModeToggle() {
    return (
        <Tooltip tip={"Toggle color mode"}>
            <IconButton
                color={"fg.2"}
                _hover={{ color: "fg.1", bgColor: "unset", scale: 1.1 }}
                size="xs"
                variant="ghost"
                outlineOffset={0}
                onClick={(e) => {
                    e.stopPropagation()
                    toggleColorMode()
                }}
            >
                <FaMoon />
            </IconButton>
        </Tooltip>
    )
}

export function FontSizeToggle() {
    return (
        <HStack gap={0}>
            <Tooltip tip={"Decrease font size"}>
                <IconButton
                    color={"fg.2"}
                    _hover={{ color: "fg.1", bgColor: "unset", scale: 1.1 }}
                    size="xs"
                    variant="ghost"
                    outlineOffset={0}
                    onClick={(e) => {
                        e.stopPropagation()
                        themeHelpers.decreaseSize()
                    }}
                >
                    <FaMinus />
                </IconButton>
            </Tooltip>
            <Tooltip tip={"Increase font size"}>
                <IconButton
                    color={"fg.2"}
                    _hover={{ color: "fg.1", bgColor: "unset", scale: 1.1 }}
                    size="xs"
                    variant="ghost"
                    outlineOffset={0}
                    onClick={(e) => {
                        e.stopPropagation()
                        themeHelpers.increaseSize()
                    }}
                >
                    <FaPlus />
                </IconButton>
            </Tooltip>
        </HStack>
    )
}

export function SidebarFooter({ children }: PropsWithChildren) {
    return (
        <VStack gap={0} pb={2}>
            {children}
        </VStack>
    )
}

type SidebarComponents = typeof SidebarComponent & {
    Button: typeof SidebarButton
    ButtonContent: typeof ButtonContent
    ButtonLabel: typeof ButtonLabel
    UpgradeButton: typeof UpgradeButton
    ColorModeToggle: typeof ColorModeToggle
    FontSizeToggle: typeof FontSizeToggle
    Footer: typeof SidebarFooter
    Spacer: typeof Spacer
}
const Sidebar = SidebarComponent as SidebarComponents
Sidebar.Button = SidebarButton
Sidebar.ButtonContent = ButtonContent
Sidebar.ButtonLabel = ButtonLabel
Sidebar.UpgradeButton = UpgradeButton
Sidebar.ColorModeToggle = ColorModeToggle
Sidebar.FontSizeToggle = FontSizeToggle
Sidebar.Footer = SidebarFooter
Sidebar.Spacer = Spacer

export default Sidebar
