import { HStack, IconButton, Spacer, VStack } from "@chakra-ui/react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { AnimatePresence, LayoutGroup, motion } from "motion/react"
import { type PropsWithChildren, Suspense, useEffect, useRef } from "react"
import { ErrorBoundary } from "react-error-boundary"
import { useSnapshot } from "valtio"
import { CheckRoot, Sidebar, Tooltip } from "@/components"
import { FaMinus, FaMoon, FaPlus } from "@/components/icons/icons"
import { Preview, useIsPreviewActive } from "@/components/preview"
import { themeHelpers } from "@/theme/helpers"
import { toggleColorMode, useColorMode } from "./components/ui/color-mode"
import ErrorFallback from "./ErrorFallback"
import AppStore from "./hooks/appState"
import { useMetadataDrop } from "./hooks/useDrop"
import { Loading } from "./main"
import "./menu"
import UpgradeButton from "./metadata/toolbar/UpgradeButton"
import { viewDescription, views } from "./views"

// import Onboard from "./Onboard"

function App() {
    const firstRender = useRef(true)

    const snap = useSnapshot(AppStore.store)
    const View = getView(snap.currentView)

    const isPreviewActive = useIsPreviewActive()
    const { colorMode } = useColorMode()

    const { handlers: dropHandlers } = useMetadataDrop()

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
            onPointerDownCapture={async (e) => {
                if (e.clientY < 50) {
                    const win = await getCurrentWindow()
                    win.startDragging()
                }
            }}
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
                    <ErrorBoundary FallbackComponent={ErrorFallback}>
                        <Suspense fallback={<Loading />}>
                            <AnimatePresence mode={"wait"}>
                                <ViewContainer
                                    key={snap.currentView}
                                    firstRender={firstRender}
                                    inert={isPreviewActive}
                                >
                                    <View flex={"1 1 auto"} />
                                </ViewContainer>
                            </AnimatePresence>
                        </Suspense>
                    </ErrorBoundary>
                    {/* {snap.onboardPhase?.startsWith("A") && <Onboard />} */}
                </CheckRoot>
            </LayoutGroup>
            <Preview />
        </HStack>
    )
}

function ViewContainer(
    props: PropsWithChildren<{ firstRender: { current: boolean }; inert?: boolean }>,
) {
    const { firstRender, children, inert } = props

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false
            getCurrentWindow().show().catch(console.error)
            console.debug("Loaded app")
        }
    }, [firstRender])

    return (
        <motion.div
            layout
            inert={inert}
            initial={{ opacity: 0, scale: 1, filter: "blur(0px)" }}
            animate={{
                opacity: 1,
                scale: 1,
                filter: "blur(0px)",
                transition: { duration: 0.1 },
            }}
            exit={{
                opacity: 0,
                scale: 1,
                filter: "blur(0px)",
                transition: { duration: 0.2 },
            }}
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flex: "1 1 auto",
                justifyContent: "stretch",
                alignItems: "stretch",
                boxShadow: "0px 2px 4px -2px #00000099",
            }}
        >
            {children}
        </motion.div>
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
