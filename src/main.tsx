import { ChakraProvider } from "@chakra-ui/react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { motion } from "motion/react"
import { lazy, StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ColorModeProvider } from "./components/ui/color-mode"
import AppState from "./hooks/appState"
import "./index.css"
import { invoke } from "@tauri-apps/api/core"
import { themeHelpers } from "./theme/helpers"
import { system } from "./theme/theme"

window.toJSON = (object: unknown) => JSON.parse(JSON.stringify(object))

const hash = document.location?.hash?.slice(1)
if (hash === "mini") AppState.setView("mini")
else if (hash === "vid") AppState.setView("vid")

const RootComponent = lazy(() => {
	if (hash === "dev") return import("./Dev")
	else return import("./App")
})

themeHelpers.applySize()

window.addEventListener("keypress", async (e) => {
	if (e.key === "`") {
		invoke("show_dev_window")
	}
})

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
					<RootComponent />
				</ColorModeProvider>
			</ChakraProvider>
			,
		</StrictMode>,
	)

export function Loading() {
	return (
		<motion.div
			initial={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			className={"loading-container"}
			transition={{ duration: 0.5 }}
		>
			<div className={"loading-text"}>Loading...</div>
		</motion.div>
	)
}
