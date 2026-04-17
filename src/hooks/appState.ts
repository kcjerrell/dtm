import { invoke } from "@tauri-apps/api/core"
import { check } from "@tauri-apps/plugin-updater"
import { store } from "@tauri-store/valtio"
// import { check } from "@/mocks/tauri-updater"
import type { SidebarVariant } from "@/components/sidebar/Sidebar"
import { getInstallId } from "@/state/settings"
import { getStoreName } from "@/utils/helpers"

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
    sidebarStyle: {
        variant?: SidebarVariant
    }
}

let update: Awaited<ReturnType<typeof check>> = null
const appStore = store(
    getStoreName("app"),
    {
        updateSize: 0,
        updateProgress: 0,
        updateStatus: "unknown",
        updateAttempts: 0,
        sidebarStyle: {},
    } as AppStateType,
    {
        filterKeys: [],
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

async function getOsVersionHeaderValue(): Promise<string> {
    try {
        return await invoke<string>("get_os_version")
    } catch (e) {
        console.error(e)
        return "unknown"
    }
}

async function checkForUpdate() {
    if (appState.updateStatus !== "unknown") return
    appState.updateStatus = "checking"
    try {
        const installId = await getInstallId()
        const osVersionHeaderValue = await getOsVersionHeaderValue()
        update = await check({
            headers: {
                "DTM-Install-Id": installId,
                "DTM-OS-Version": osVersionHeaderValue,
            },
        })
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

function setSidebarVariant(variant: SidebarVariant | undefined) {
    appState.sidebarStyle.variant = variant
}

const AppStore = {
    store: appState,
    checkForUpdate,
    downloadAndInstallUpdate,
    retryUpdate,
    setSidebarVariant,
}

export default AppStore
