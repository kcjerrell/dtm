import type { RefObject } from "react"
import { useSnapshot } from "valtio"
import { useSetting } from "@/state/settings"
import AppStore from "./appState"

export type RootElement =
    | /** root react element, covers entire window */
    "app"
    /** root view element, covers everything but the sidebar */
    | "view"
    /** depends on active view */
    | "viewContent"
    | "viewAltContent"

const rootElementIds = {
    app: "root",
    view: "check-root",
    viewContent: { projects: "project-content-pane" },
    viewAltContent: { projects: "details-overlay" },
} as const

function getElement(id: keyof typeof rootElementIds, view?: string) {
    if (id !== "viewContent") return document.getElementById(rootElementIds[id] as string)
    if (view && view in rootElementIds.viewContent)
        return document.getElementById(
            rootElementIds.viewContent[view as keyof typeof rootElementIds.viewContent],
        )
    return null
}

export function useRootElement(rootElement: RootElement) {
    const [currentView] = useSetting("app.currentView")

    if (process.env.NODE_ENV === "test") {
        return document.getElementById("root")
    }

    const element = getElement(rootElement, currentView)
    // if (!element) throw new Error(`Element ${rootElementIds[rootElement]} not found`)
    return element
}

export function useRootElementRef(rootElement?: RootElement): RefObject<HTMLDivElement | null> {
    const [currentView] = useSetting("app.currentView")

    if (!rootElement) return { current: null }

    if (process.env.NODE_ENV === "test") {
        return { current: document.getElementById("root") as HTMLDivElement | null }
    }

    const ref = {
        get current(): HTMLDivElement | null {
            return getElement(rootElement, currentView) as HTMLDivElement | null
        },
    }

    return ref
}
