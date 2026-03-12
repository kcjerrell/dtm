import { getCurrentWindow } from "@tauri-apps/api/window"
import { LayoutGroup } from "motion/react"
import { useEffect, useRef } from "react"
import { useSnapshot } from "valtio"
import { AppRoot, CheckRoot, Sidebar, ViewContainer } from "@/components"
import { Preview, useIsPreviewActive } from "@/components/preview"
import { useColorMode } from "./components/ui/color-mode"
import AppStore from "./hooks/appState"
import { useDragWindow } from "./hooks/useDragWindow"
import { useMetadataDrop } from "./hooks/useDrop"
import "./menu"
import { getView, viewDescription } from "./views"

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
        <AppRoot onContextMenu={(e) => e.preventDefault()} {...dropHandlers}>
            <LayoutGroup>
                <Sidebar
                    inert={isPreviewActive}
                    aria-label="Primary"
                    variant={snap.sidebarStyle.variant}
                >
                    {viewDescription.map((item) => (
                        <Sidebar.Button
                            key={item.viewId}
                            item={item}
                            isActive={snap.currentView === item.viewId}
                            onClick={() => AppStore.setView(item.viewId)}
                        />
                    ))}
                    <Sidebar.UpgradeButton marginTop={4} />
                    <Sidebar.Spacer />
                    <Sidebar.Footer>
                        <Sidebar.ColorModeToggle />
                        <Sidebar.FontSizeToggle />
                    </Sidebar.Footer>
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
        </AppRoot>
    )
}

export default App
