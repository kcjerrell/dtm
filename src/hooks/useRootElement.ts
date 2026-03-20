import { useSnapshot } from "valtio"
import AppStore from "./appState"
import { RefObject } from "react"

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
    const { currentView } = useSnapshot(AppStore.store)

    if (process.env.NODE_ENV === "test") {
        return document.getElementById("root")
    }

    const element = getElement(rootElement, currentView)
    if (!element) throw new Error(`Element ${rootElementIds[rootElement]} not found`)
    return element
}

export function useRootElementRef(rootElement?: RootElement): RefObject<HTMLDivElement | null> {
    const { currentView } = useSnapshot(AppStore.store)

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
