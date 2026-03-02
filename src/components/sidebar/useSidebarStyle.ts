import { useEffect } from "react"
import AppStore from "@/hooks/appState"
import type { SidebarVariant } from "./Sidebar"

export function useSidebarStyle(variant: SidebarVariant) {
    useEffect(() => {
        AppStore.setSidebarVariant(variant)

        return () => {
            AppStore.setSidebarVariant(undefined)
        }
    }, [variant])
}
