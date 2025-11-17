import { postMessage } from "@/context/Messages"
import { check } from "@tauri-apps/plugin-updater"
import { proxy } from "valtio"

type ViewRequest = {
	open: {
		projectId?: number,
		tensorId?: string,
		nodeId?: number,
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
}

let update: Awaited<ReturnType<typeof check>> = null
const store: AppStateType = proxy({
	updateSize: 0,
	updateProgress: 0,
	updateStatus: "unknown",
	updateAttempts: 0,
	currentView: localStorage.getItem("currentView") || "metadata",
	isSidebarVisible: true,
	viewRequests: {},
})

async function checkForUpdate() {
	if (store.updateStatus !== "unknown") return
	store.updateStatus = "checking"
	try {
		update = await check()
		if (update) {
			store.updateStatus = "found"
			postMessage({
				channel: "toolbar",
				message: "Update available! Click the update button to download",
				duration: 5000,
				uType: "update",
			})
		} else store.updateStatus = "none"
	} catch (e) {
		console.error(e)
		store.updateStatus = "error"
	}
}

async function downloadAndInstallUpdate() {
	if (!update || store.updateStatus !== "found") return
	try {
		store.updateStatus = "downloading"
		postMessage({
			channel: "toolbar",
			message: "Downloading update...",
			uType: "update",
		})
		await update.download()

		store.updateStatus = "installing"
		postMessage({
			channel: "toolbar",
			message: "Installing update...",
			uType: "update",
		})
		await update.install()

		store.updateStatus = "installed"
		postMessage({
			channel: "toolbar",
			message: "Update installed! Click the update button to restart",
			duration: 3000,
			uType: "update",
		})
	} catch (e) {
		console.error(e)
		store.updateStatus = "error"
		postMessage({
			channel: "toolbar",
			message: "There was a problem installing the update. Click to retry.",
			duration: 3000,
			uType: "update",
		})
	}
}

async function retryUpdate() {
	if (store.updateStatus !== "error" || store.updateAttempts >= 3) return
	store.updateAttempts++
	store.updateStatus = "unknown"
	await checkForUpdate()
}

async function setView(view: string) {
	store.currentView = view
	if (!store.viewRequests[view]) store.viewRequests[view] = []
	localStorage.setItem("currentView", view)
}

function setShowSidebar(show: boolean) {
	store.isSidebarVisible = show
}

async function setViewRequest(view: string, request: ViewRequest) {
	await setView(view)
	store.viewRequests[view].push(request)
}

const AppState = {
	store,
	checkForUpdate,
	downloadAndInstallUpdate,
	setView,
	retryUpdate,
	showSidebar: setShowSidebar,
	setViewRequest,
}

export default AppState
