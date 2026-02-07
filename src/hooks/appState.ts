import { check } from "@tauri-apps/plugin-updater"
// import { check } from "@/mocks/tauri-updater"
import { store } from "@tauri-store/valtio"
import { getStoreName } from "@/utils/helpers"

type ViewRequest = {
    open: {
        projectId?: number
        tensorId?: string
        nodeId?: number
    }
}

type AppStateType = {
    // update: Awaited<ReturnType<typeof check>>
    updateSize: number
    updateProgress: number
    updateStatus:
        | "unknown"
        | "checking"
        | "none"
        | "found"
        | "downloading"
        | "installing"
        | "installed"
        | "error"
    updateAttempts: number
    currentView: string
    isSidebarVisible: boolean
    viewRequests: Record<string, ViewRequest[]>
    onboardPhase: string
    clearHistoryOnExit: boolean
    clearPinsOnExit: boolean
}

let update: Awaited<ReturnType<typeof check>> = null
const appStore = store(
    getStoreName("app"),
    {
        updateSize: 0,
        updateProgress: 0,
        updateStatus: "unknown",
        updateAttempts: 0,
        currentView: "metadata",
        isSidebarVisible: true,
        viewRequests: {},
        onboardPhase: "A1",
        clearHistoryOnExit: false,
        clearPinsOnExit: false,
    } as AppStateType,
    {
        filterKeys: [
            "currentView",
            "isSidebarVisible",
            "onboardPhase",
            "clearHistoryOnExit",
            "clearPinsOnExit",
        ],
        filterKeysStrategy: "pick",
        saveStrategy: "debounce",
        saveInterval: 1000,
        saveOnChange: true,
    },
)
appStore.start()
window.addEventListener("unloaded", () => {
    appStore.stop()
})
const appState: AppStateType = appStore.state

async function checkForUpdate() {
    if (appState.updateStatus !== "unknown") return
    appState.updateStatus = "checking"
    try {
        update = await check()
        if (update) {
            appState.updateStatus = "found"
        } else appState.updateStatus = "none"
    } catch (e) {
        console.error(e)
        appState.updateStatus = "error"
    }
}

async function downloadAndInstallUpdate() {
    if (!update || appState.updateStatus !== "found") return
    try {
        appState.updateStatus = "downloading"
        await update.download()

        appState.updateStatus = "installing"
        await update.install()

        appState.updateStatus = "installed"
    } catch (e) {
        console.error(e)
        appState.updateStatus = "error"
    }
}

async function retryUpdate() {
    if (appState.updateStatus !== "error" || appState.updateAttempts >= 3) return
    appState.updateAttempts++
    appState.updateStatus = "unknown"
    await checkForUpdate()
}

async function setView(view: string) {
    appState.currentView = view
    if (!appState.viewRequests[view]) appState.viewRequests[view] = []
    localStorage.setItem("currentView", view)
}

function setShowSidebar(show: boolean) {
    appState.isSidebarVisible = show
}

async function setViewRequest(view: string, request: ViewRequest) {
    await setView(view)
    appState.viewRequests[view].push(request)
}

const AppStore = {
    store: appState,
    checkForUpdate,
    downloadAndInstallUpdate,
    setView,
    retryUpdate,
    showSidebar: setShowSidebar,
    setViewRequest,
}

export default AppStore
