import { check } from "@tauri-apps/plugin-updater"
import { store } from "@tauri-store/valtio"
import { postMessage } from "@/context/Messages"
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
		isSidebarVisible: false,
		viewRequests: {},
		onboardPhase: "A1",
	} as AppStateType,
	{
		filterKeys: ["updateSize", "updateProgress", "updateStatus", "updateAttempts", "viewRequests"],
		filterKeysStrategy: "omit",
	},
)
appStore.start()
const appState: AppStateType = appStore.state

async function checkForUpdate() {
	if (appState.updateStatus !== "unknown") return
	appState.updateStatus = "checking"
	try {
		update = await check()
		if (update) {
			appState.updateStatus = "found"
			postMessage({
				channel: "toolbar",
				message: "Update available! Click the update button to download",
				duration: 5000,
				uType: "update",
			})
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
		postMessage({
			channel: "toolbar",
			message: "Downloading update...",
			uType: "update",
		})
		await update.download()

		appState.updateStatus = "installing"
		postMessage({
			channel: "toolbar",
			message: "Installing update...",
			uType: "update",
		})
		await update.install()

		appState.updateStatus = "installed"
		postMessage({
			channel: "toolbar",
			message: "Update installed! Click the update button to restart",
			duration: 3000,
			uType: "update",
		})
	} catch (e) {
		console.error(e)
		appState.updateStatus = "error"
		postMessage({
			channel: "toolbar",
			message: "There was a problem installing the update. Click to retry.",
			duration: 3000,
			uType: "update",
		})
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
