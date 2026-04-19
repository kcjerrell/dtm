import { ChakraProvider } from "@chakra-ui/react"
import { invoke } from "@tauri-apps/api/core"
import { motion } from "motion/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { HotkeysProvider } from "react-hotkeys-hook"
import App from "./App"
import { ColorModeProvider } from "./components/ui/color-mode"
import { Hotkey } from "./hooks/keyboard"
import "./index.css"
import { addTestHooks } from "./testHooks"
import { themeHelpers } from "./theme/helpers"
import { system } from "./theme/theme"
import { forwardConsoleAll } from "./utils/tauriLogger"
import { loadSettingsStore } from "./state/settings"

const _global = globalThis as unknown as {
    _reactRoot?: ReturnType<typeof createRoot>
}

async function reset_db() {
    const { preloadDTP } = await import("./dtProjects/state/context")
    console.log("resetting db")
    // this ensures the db has started
    await preloadDTP()
    await invoke("dtp_reset_db")
}

async function bootstrap() {
    if (!import.meta.env.DEV) forwardConsoleAll()
    window.toJSON = (object: unknown) => JSON.parse(JSON.stringify(object))
    window.__reset_db = reset_db
    window.__reset_metadata_store = async () => {
        const { resetMetadataStore } = await import("./metadata/state/metadataStore")
        resetMetadataStore()
    }
    addTestHooks()

    // this store must be initialized and await so installId is determinate
    // if allowed to lazy load, update check may run before settings have synced from storage
    await loadSettingsStore()

    // const hash = document.location?.hash?.slice(1)
    // if (hash === "mini") AppStore.setView("mini")
    // else if (hash === "vid") AppStore.setView("vid")

    const RootComponent = App

    themeHelpers.applySize()

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

    // this ensures that the window appears even if an error is thrown in the initial render
    // if (hash !== "dev") {
    //     setTimeout(() => {
    //         getCurrentWindow().show()
    //     }, 3000)
    // }

    const container = document.getElementById("root")
    if (container) {
        if (!_global._reactRoot) {
            _global._reactRoot = createRoot(container)
        }

        _global._reactRoot.render(
            <StrictMode>
                <ChakraProvider value={system}>
                    <ColorModeProvider>
                        <HotkeysProvider initiallyActiveScopes={["app"]}>
                            <RootComponent />
                            <Hotkey handlers={{ "meta+r": () => location.reload() }} />
                        </HotkeysProvider>
                    </ColorModeProvider>
                </ChakraProvider>
            </StrictMode>,
        )
    }
}

export function Loading() {
    return (
        <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={"loading-container"}
            transition={{ duration: 2 }}
            style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
            }}
        >
            <div className={"loading-text"}>Loading...</div>
        </motion.div>
    )
}

bootstrap()
