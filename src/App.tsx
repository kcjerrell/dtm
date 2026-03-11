import { HStack, IconButton, Spacer, VStack } from "@chakra-ui/react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { LayoutGroup, motion, type Variants } from "motion/react"
import { Activity, type PropsWithChildren, Suspense, useEffect, useRef, useState } from "react"
import { ErrorBoundary } from "react-error-boundary"
import { useSnapshot } from "valtio"
import { CheckRoot, Sidebar, Tooltip } from "@/components"
import { FaMinus, FaMoon, FaPlus } from "@/components/icons/icons"
import { Preview, useIsPreviewActive } from "@/components/preview"
import { themeHelpers } from "@/theme/helpers"
import { toggleColorMode, useColorMode } from "./components/ui/color-mode"
import ErrorFallback from "./ErrorFallback"
import AppStore from "./hooks/appState"
import { useDragWindow } from "./hooks/useDragWindow"
import { useMetadataDrop } from "./hooks/useDrop"
import { Loading } from "./main"
import "./menu"
import UpgradeButton from "./metadata/toolbar/UpgradeButton"
import { viewDescription, views } from "./views"

function App() {
    const mountedViews = useRef<Set<string>>(new Set())
    const firstRender = useRef(true)

    const snap = useSnapshot(AppStore.store)
    mountedViews.current.add(snap.currentView)

    const isPreviewActive = useIsPreviewActive()
    const { colorMode } = useColorMode()

    const { handlers: dropHandlers } = useMetadataDrop()
    useDragWindow()

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false
            getCurrentWindow().show().catch(console.error)
            console.debug("Loaded app")
        }
    }, [])

    return (
        <HStack
            onContextMenu={(e) => e.preventDefault()}
            position={"relative"}
            width={"100vw"}
            height={"100vh"}
            overflow="hidden"
            alignItems={"stretch"}
            justifyContent={"stretch"}
            cursor={"default"}
            userSelect={"none"}
            gap={0}
            bgColor={"grayc.14"}
            transformOrigin={"left top"}
            {...dropHandlers}
        >
            <LayoutGroup>
                <Sidebar
                    inert={isPreviewActive}
                    aria-label="Primary"
                    variant={snap.sidebarStyle.variant}
                >
                    {viewDescription.map((item) => (
                        <Sidebar.Button
                            aria-selected={snap.currentView === item.viewId || undefined}
                            key={item.viewId}
                            label={item.label}
                            icon={item.icon}
                            isActive={snap.currentView === item.viewId}
                            onClick={() => AppStore.setView(item.viewId)}
                        />
                    ))}
                    <UpgradeButton marginTop={4} />
                    <Spacer />
                    <VStack gap={0} pb={2}>
                        <Tooltip tip={"Toggle color mode"}>
                            <IconButton
                                color={"fg.2"}
                                _hover={{ color: "fg.1", bgColor: "unset", scale: 1.1 }}
                                size="xs"
                                variant="ghost"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    toggleColorMode()
                                }}
                            >
                                <FaMoon />
                            </IconButton>
                        </Tooltip>
                        <HStack gap={0}>
                            <Tooltip tip={"Decrease font size"}>
                                <IconButton
                                    color={"fg.2"}
                                    _hover={{ color: "fg.1", bgColor: "unset", scale: 1.1 }}
                                    size="xs"
                                    variant="ghost"
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
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        themeHelpers.increaseSize()
                                    }}
                                >
                                    <FaPlus />
                                </IconButton>
                            </Tooltip>
                        </HStack>
                    </VStack>
                </Sidebar>
                <CheckRoot
                    id={"check-root"}
                    dark={colorMode === "dark"}
                    variant={snap.sidebarStyle.variant}
                >
                    {Array.from(mountedViews.current).map((v) => {
                        const View = getView(v)
                        const isActiveView = v === snap.currentView
                        return (
                            <ViewContainer key={v} isActiveView={isActiveView}>
                                <View flex={"1 1 auto"} />
                            </ViewContainer>
                        )
                    })}
                </CheckRoot>
            </LayoutGroup>
            <Preview />
        </HStack>
    )
}

function ViewContainer(
    props: PropsWithChildren<{
        isActiveView: boolean
    }>,
) {
    const { children, isActiveView } = props
    const [mode, setMode] = useState<"hidden" | "visible">("hidden")

    const variants: Variants = {
        inactive: {
            zIndex: 1,
            opacity: 0,
            transition: {
                duration: 0.1,
            },
        },
        active: {
            zIndex: 0,
            opacity: 1,
            scale: 1,
            transition: {
                duration: 0.1,
            },
        },
    }

    useEffect(() => {
        if (isActiveView) setMode("visible")
        else setTimeout(() => setMode("hidden"), 200)
    }, [isActiveView])

    return (
        <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<Loading />}>
                <Activity mode={mode}>
                    <motion.div
                        layout
                        inert={!isActiveView}
                        variants={variants}
                        initial={"inactive"}
                        animate={isActiveView ? "active" : "inactive"}
                        style={{
                            position: "absolute",
                            inset: "0",
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            justifyContent: "stretch",
                            alignItems: "stretch",
                            boxShadow: "0px 2px 4px -2px #00000099",
                        }}
                    >
                        {children}
                    </motion.div>
                </Activity>
            </Suspense>
        </ErrorBoundary>
    )
}

function getView(view: string) {
    if (isView(view)) return views[view]
    return views.metadata
}

function isView(view: string): view is keyof typeof views {
    return view in views
}

export default App
