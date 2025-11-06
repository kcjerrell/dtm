import { ChakraProvider } from "@chakra-ui/react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { motion } from "motion/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { ColorModeProvider } from "./components/ui/color-mode"
import AppState from "./hooks/appState"
import "./index.css"
import { themeHelpers } from "./theme/helpers"
import { system } from "./theme/theme"

window.toJSON = (object: unknown) => JSON.parse(JSON.stringify(object))

const hash = document.location?.hash?.slice(1)
if (hash === "mini") AppState.setView("mini")
else if (hash === "vid") AppState.setView("vid")

themeHelpers.applySize()

// temp fix in case exception is thrown during first render.
// use an error boundary instead
setTimeout(() => {
	getCurrentWindow().show()
}, 3000)

const root = document.getElementById("root")
if (root)
	createRoot(root).render(
		<StrictMode>
			<ChakraProvider value={system}>
				<ColorModeProvider>
					<App />
				</ColorModeProvider>
			</ChakraProvider>,
		</StrictMode>,
	)

export function Loading() {
	return (
		<motion.div
			initial={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			className={"loading-container"}
			// style={{ zIndex: 100 }}
			transition={{ duration: 0.5 }}
		>
			<div className={"loading-text"}>Loading...</div>
		</motion.div>
	)
}
