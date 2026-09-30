import "@wdio/tauri-plugin"
import { ChakraProvider } from "@chakra-ui/react"
import { motion } from "motion/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { HotkeysProvider } from "react-hotkeys-hook"
import App from "./App"
import { ColorModeProvider } from "./components/ui/color-mode"
import { Hotkey } from "./hooks/keyboard"
import "./index.css"
import Lifecycle from "./lifecycle"
import { system } from "./theme/theme"

const _global = globalThis as unknown as {
    _reactRoot?: ReturnType<typeof createRoot>
}

async function bootstrap() {
    await Lifecycle.init()

    const RootComponent = App

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
                            <Hotkey handlers={{ "meta+r": () => Lifecycle.reload().catch(console.error) }} />
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
