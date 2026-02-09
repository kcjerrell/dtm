import { ChakraProvider } from "@chakra-ui/react"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { motion } from "motion/react"
import { lazy, StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ColorModeProvider } from "./components/ui/color-mode"
import AppStore from "./hooks/appState"
import "./index.css"
import { HotkeysProvider } from "react-hotkeys-hook"
import { themeHelpers } from "./theme/helpers"
import { system } from "./theme/theme"
import "./utils/tauriLogger"
import App from './App'

window.toJSON = (object: unknown) => JSON.parse(JSON.stringify(object))

const hash = document.location?.hash?.slice(1)
if (hash === "mini") AppStore.setView("mini")
else if (hash === "vid") AppStore.setView("vid")

const RootComponent = App

themeHelpers.applySize()

if (import.meta.env.DEV) {
    const _global = globalThis as unknown as { _devKeyPressHandler?: (e: KeyboardEvent) => void }
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
if (hash !== "dev") {
    setTimeout(() => {
        getCurrentWindow().show()
    }, 3000)
}

const root = document.getElementById("root")
if (root)
    createRoot(root).render(
        <StrictMode>
            <ChakraProvider value={system}>
                <ColorModeProvider>
                    <HotkeysProvider initiallyActiveScopes={["*"]}>
                        <RootComponent />
                    </HotkeysProvider>
                </ColorModeProvider>
            </ChakraProvider>
        </StrictMode>,
    )

export function Loading() {
    return (
        <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={"loading-container"}
            transition={{ duration: 2 }}
        >
            <div className={"loading-text"}>Loading...</div>
        </motion.div>
    )
}
