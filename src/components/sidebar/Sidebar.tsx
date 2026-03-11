import { chakra } from "@chakra-ui/react"
import type { ComponentProps, PropsWithChildren } from "react"
import { useSnapshot } from "valtio"
import AppStore from "@/hooks/appState"
import { cs } from "@/utils/helpers"

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
                    _hover: {
                        transform: "translateX(8px)",
                        "& > *:not([aria-selected='true'])": {
                            borderRightColor: "gray/50",
                        },
                    },
                },
            },
            variant: {
                attached: {
                    zIndex: "unset",
                    borderRadius: "none",
                    boxShadow: cs(
                        "0px 0px 2px -1px #00000000",
                        "0px 3px 12px -3px #00000000",
                        // "-2px 0px 8px -2px #00000022 inset",
                    ),
                    // borderRight: "1px solid {colors.grayc.12/50}",
                },
                float: {
                    zIndex: 2,
                    borderRadius: "lg",
                    boxShadow: cs(
                        "0px 0px 5px -1px #00000055",
                        "0px 3px 12px -3px #00000055",
                        // "-2px 0px 6px -2px #FF000000 inset",
                    ),
                    // boxShadow: "pane1",
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
                    // boxShadow: cs(
                    //     "0px 0px 5px -1px #00000055",
                    //     "0px 3px 12px -3px #00000055",
                    //     // "-2px 0px 6px -2px #FF000000 inset",
                    // ),
                    borderRight: "1px solid {colors.grays.4/50}",
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
        borderRadius: "0"
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
                // borderColor: "gray/20",
                // borderRadius: "lg",
                my: "4px",
                py: "4px",
                "&>*": {
                    opacity: 0,
                },
                _hover: {
                    transform: "translateX(50px) !important",
                    // bgColor: "bg.0/70",
                    bgColor: "inherit",
                    boxShadow: "pane1",
                    // backdropFilter: "blur(8px)",
                    // borderRadius: "0 8px 8px 0",
                    "&>*": {
                        opacity: 1,
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
            true: {},
            false: {},
        },
    },
    compoundVariants: [
        {
            update: true,
            popout: true,
            css: {
                transform: "translateX(50px) !important",
                // bgColor: "bg.0/70",
                boxShadow: "pane1",
                // backdropFilter: "blur(8px)",
                // borderRadius: "0 8px 8px 0",
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
        // flex: "1 1 auto",
        // px: "15px",
        // pt: "5px",
        // pb: "5px",
        // padding: "5px",
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
    label: string
    icon: React.FC
    isActive?: boolean
    isUpgrade?: boolean
}

export function SidebarButton(props: SidebarButtonProps) {
    const { label, icon: Icon, onClick, isActive = false, isUpgrade = false, ...rest } = props
    const { isSidebarVisible } = useSnapshot(AppStore.store)

    return (
        <ButtonBase
            aria-current={isActive ? "page" : undefined}
            isActive={isActive}
            popout={!isSidebarVisible}
            update={isUpgrade}
            onClick={(e) => {
                e.stopPropagation()
                onClick?.(e)
            }}
            {...rest}
        >
            <ButtonContent asChild>
                <Icon />
            </ButtonContent>
            <ButtonLabel>{label}</ButtonLabel>
        </ButtonBase>
    )
}

type SidebarComponents = typeof SidebarComponent & {
    Button: typeof SidebarButton
}
const Sidebar = SidebarComponent as SidebarComponents
Sidebar.Button = SidebarButton

export default Sidebar
