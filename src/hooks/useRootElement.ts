import { useSnapshot } from "valtio"
import AppStore from "./appState"

export type RootElement =
    | /** root react element, covers entire window */
    "app"
    /** root view element, covers everything but the sidebar */
    | "view"
    /** depends on active view */
    | "viewContent"

const rootElementIds = {
    app: "root",
    view: "check-root",
    viewContent: { projects: "project-content-pane" },
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

    const element = getElement(rootElement, currentView)
    if (!element) throw new Error(`Element ${rootElementIds[rootElement]} not found`)
    return element
}
