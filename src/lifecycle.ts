import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { loadSettingsStore } from "./state/settings"
import { addTestHooks } from "./testHooks"
import { themeHelpers } from "./theme/helpers"
import { forwardConsoleAll } from "./utils/tauriLogger"

type OnExitCallback = () => void | Promise<void>

const onExitCallbacks: OnExitCallback[] = []
const onReloadCallbacks: OnExitCallback[] = []

async function init() {
    if (!import.meta.env.DEV) forwardConsoleAll()
    window.toJSON = (object: unknown) => JSON.parse(JSON.stringify(object))

    themeHelpers.applySize()

    addTestHooks()

    // this store must be initialized and awaited so installId is determinate
    // if allowed to lazy load, update check may run before settings have synced from storage
    await loadSettingsStore()

    const tauriWindow = getCurrentWindow()
    await tauriWindow.onCloseRequested(async (e) => {
        e.preventDefault()
        try {
            await runCallbacks(onExitCallbacks)
            await tauriWindow.destroy()
        } catch (error) {
            console.error("Failed to close after exit cleanup", error)
        }
    })

    if (import.meta.env.DEV) {
        const _global = globalThis as unknown as {
            _devKeyPressHandler?: (e: KeyboardEvent) => void
        }
        if (_global._devKeyPressHandler) {
            window.removeEventListener("keypress", _global._devKeyPressHandler)
        }
        _global._devKeyPressHandler = async (e: KeyboardEvent) => {
            if (e.key === "`") {
                invoke("show_dev_window")
            }
        }
        window.addEventListener("keypress", _global._devKeyPressHandler)
    }
}

async function runCallbacks(callbacks: OnExitCallback[]) {
    const errors: unknown[] = []
    for (const callback of [...callbacks]) {
        try {
            await callback()
        } catch (error) {
            errors.push(error)
        }
    }
    if (errors.length) throw new AggregateError(errors, "Lifecycle cleanup failed")
}

async function reload() {
    await runCallbacks(onReloadCallbacks)
    location.reload()
}

function onExit(callback: () => void | Promise<void>, runOnReload?: boolean) {
    onExitCallbacks.push(callback)
    if (runOnReload) onReloadCallbacks.push(callback)

    return () => {
        const index = onExitCallbacks.indexOf(callback)
        if (index !== -1) onExitCallbacks.splice(index, 1)

        if (runOnReload) {
            const reloadIndex = onReloadCallbacks.indexOf(callback)
            if (reloadIndex !== -1) onReloadCallbacks.splice(reloadIndex, 1)
        }
    }
}

const Lifecycle = {
    init,
    reload,
    onExit,
}

export default Lifecycle
