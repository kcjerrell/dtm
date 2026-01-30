import { chakra } from "@chakra-ui/react"
import type { ComponentProps, PropsWithChildren } from "react"
import { useSnapshot } from "valtio"
import AppStore from "@/hooks/appState"

const Root = chakra(
    "div",
    {
        base: {
            display: "flex",
            flexDirection: "column",
            zIndex: 2,
            justifyContent: "flex-start",
            alignItems: "stretch",
            gap: 0,
            paddingTop: "30px",
            bgColor: "bg.2",
            flex: "0 0 auto",
            width: "68px",
            borderRadius: "lg",
            marginLeft: "0px",
            transition: "all 0.2s ease",
            boxShadow: "pane1",
        },
        variants: {
            hidden: {
                true: {
                    marginLeft: "-60px",
                    _hover: {
                        transform: "translateX(8px)",
                        "&>*": {
                            borderColor: "gray/50",
                            borderRadius: "lg",
                        },
                    },
                },
            },
        },
    },
    {},
)

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
                borderColor: "gray/20",
                // borderRadius: "lg",
                "&>*": {
                    opacity: 0,
                },
                _hover: {
                    transform: "translateX(50px) !important",
                    bgColor: "bg.0/70",
                    boxShadow: "pane1",
                    backdropFilter: "blur(8px)",
                    borderRadius: "0 8px 8px 0",
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
                bgColor: "bg.0/70",
                boxShadow: "pane1",
                backdropFilter: "blur(8px)",
                borderRadius: "0 8px 8px 0",
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
