import { getVersion } from "@tauri-apps/api/app"
import {
	type AboutMetadata,
	CheckMenuItem,
	Menu,
	MenuItem,
	PredefinedMenuItem,
	Submenu,
} from "@tauri-apps/api/menu"
import * as pathLib from "@tauri-apps/api/path"
import { open } from "@tauri-apps/plugin-dialog"
import { exit } from "@tauri-apps/plugin-process"
import { subscribe } from "valtio"
import { toggleColorMode } from "./components/ui/color-mode"
import { postMessage } from "./context/Messages"
import AppStore from "./hooks/appState"
import { themeHelpers } from "./theme/helpers"
import { getLocalImage } from "./utils/clipboard"

const Separator = () => PredefinedMenuItem.new({ item: "Separator" })

let _metadataStore = null as typeof import("./metadata/state/store") | null
async function getMetadataStore() {
	if (!_metadataStore) _metadataStore = await import("./metadata/state/store")
	return _metadataStore
}

const aboutApp: AboutMetadata = {
	name: "DTM",
	version: await getVersion(),
	website: "https://github.com/kcjerrell/dtm",
	websiteLabel: "DTM GitHub",
	authors: ["kcjerrell"],
	comments: "Hello",
	license: "MIT",
	credits: "https://github.com/kcjerrell/dtm",
	copyright: "https://drawthings.ai/",
	shortVersion: "DTM",
}

// Will become the application submenu on MacOS
const aboutSubmenu = await Submenu.new({
	text: "About",
	items: [
		await PredefinedMenuItem.new({
			item: { About: aboutApp },
			text: "About",
		}),
		await MenuItem.new({
			text: "Check for Updates...",
			id: "about_checkForUpdates",
			action: async () => {
				postMessage({
					channel: "toolbar",
					message: "Checking for updates...",
					uType: "update",
					duration: 3000,
				})
				await AppStore.checkForUpdate()
			},
		}),
		await Separator(),
		await PredefinedMenuItem.new({
			item: "Services",
			text: "Services",
		}),
		await Separator(),
		await PredefinedMenuItem.new({
			item: "Hide",
			text: "Hide DTM",
		}),
		await PredefinedMenuItem.new({
			item: "HideOthers",
			text: "Hide Others",
		}),
		await PredefinedMenuItem.new({
			item: "ShowAll",
			text: "Show All",
		}),
		await Separator(),
		await MenuItem.new({
			id: "dtm_quit",
			text: "Quit DTM",
			accelerator: "Command+Q",
			action: async () => {
				await exit(0)
			},
		}),
	],
})

const fileSubmenu = await Submenu.new({
	text: "File",
	items: [
		await MenuItem.new({
			text: "Open...",
			id: "file_open",
			action: async () => {
				const imagePath = await open({
					multiple: false,
					title: "Open image",
					filters: [
						{ name: "Image", extensions: ["jpg", "jpeg", "png", "tiff", "webp", "gif", "bmp"] },
					],
				})
				if (imagePath == null) return
				const image = await getLocalImage(imagePath)
				if (image)
					await (await getMetadataStore()).createImageItem(
						image,
						await pathLib.extname(imagePath),
						{
							source: "open",
							file: imagePath,
						},
					)
			},
		}),
		await MenuItem.new({
			text: "Open from pasteboard...",
			id: "file_openPasteboard",
			action: async () => {
				const { loadImage2 } = await import("./metadata/state/imageLoaders")
				await loadImage2("general")
			},
		}),
		await Separator(),
		await MenuItem.new({
			text: "Close",
			id: "file_close",
			action: async () => {
				await (await getMetadataStore()).clearCurrent()
			},
		}),
		await MenuItem.new({
			text: "Close unpinned",
			id: "file_closeUnpinned",
			action: async () => {
				await (await getMetadataStore()).clearAll(true)
			},
		}),
		await MenuItem.new({
			text: "Close all",
			id: "file_closeAll",
			action: async () => {
				await (await getMetadataStore()).clearAll(false)
			},
		}),
	],
})

const editSubmenu = await Submenu.new({
	text: "Edit",
	items: [
		await PredefinedMenuItem.new({
			text: "Cut",
			item: "Cut",
		}),
		await PredefinedMenuItem.new({
			text: "Copy",
			item: "Copy",
		}),
		await PredefinedMenuItem.new({
			text: "Paste",
			item: "Paste",
		}),
	],
})

const viewSubmenu = await Submenu.new({
	text: "View",
	items: [
		await MenuItem.new({
			text: "Metadata",
			id: "view-metadata",
			action: async () => {
				AppStore.setView("metadata")
			},
		}),
		await MenuItem.new({
			text: "Vid",
			id: "view-vid",
			action: async () => {
				AppStore.setView("vid")
			},
		}),
		await MenuItem.new({
			text: "Library",
			id: "view-library",
			action: async () => {
				AppStore.setView("library")
			},
		}),
		await MenuItem.new({
			text: "Scratch",
			id: "view-scratch",
			action: async () => {
				AppStore.setView("scratch")
			},
		}),
	],
})

type CreateOptionMenuOpts = {
	clearPinsOnExit?: boolean
	clearHistoryOnExit?: boolean
}
async function createOptionsMenu(opts?: CreateOptionMenuOpts) {
	return await Submenu.new({
		text: "Options",
		items: [
			await MenuItem.new({
				text: "Decrease Size",
				action: () => {
					themeHelpers.decreaseSize()
				},
			}),
			await MenuItem.new({
				text: "Increase Size",
				action: () => {
					themeHelpers.increaseSize()
				},
			}),
			await MenuItem.new({
				text: "Toggle color mode",
				action: () => {
					toggleColorMode()
				},
			}),
			await Separator(),
			await CheckMenuItem.new({
				text: "Clear pinned images on exit",
				id: "options_clearPinsOnExit",
				checked: opts?.clearPinsOnExit,
				action: async () => {
					AppStore.store.clearPinsOnExit = !opts?.clearPinsOnExit
				},
			}),
			await CheckMenuItem.new({
				text: "Clear history on exit",
				id: "options_clearHistoryOnExit",
				checked: opts?.clearHistoryOnExit,
				action: async () => {
					AppStore.store.clearHistoryOnExit = !opts?.clearHistoryOnExit
				},
			}),
		],
	})
}

let lastOpts: CreateOptionMenuOpts | null = null

async function updateMenu(opts?: CreateOptionMenuOpts) {
	lastOpts = opts ?? (await createOpts())
	const menus = [aboutSubmenu, fileSubmenu, editSubmenu, await createOptionsMenu(lastOpts)]
	if (import.meta.env.DEV) menus.push(viewSubmenu)
	const menu = await Menu.new({
		items: menus,
	})

	menu.setAsAppMenu()
}

async function createOpts(): Promise<CreateOptionMenuOpts> {
	return {
		clearHistoryOnExit: AppStore.store.clearHistoryOnExit,
		clearPinsOnExit: AppStore.store.clearPinsOnExit,
	}
}

await updateMenu()

const _global = globalThis as unknown as { _menuUnsubscribe?: () => void }
if (_global._menuUnsubscribe) _global._menuUnsubscribe()

_global._menuUnsubscribe = subscribe(AppStore.store, async () => {
	if (
		lastOpts?.clearHistoryOnExit !== AppStore.store.clearHistoryOnExit ||
		lastOpts?.clearPinsOnExit !== AppStore.store.clearPinsOnExit
	) {
		await updateMenu()
	}
})

