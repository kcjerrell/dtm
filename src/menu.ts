import { getVersion } from "@tauri-apps/api/app"
import {
    type AboutMetadata,
    CheckMenuItem,
    Menu,
    MenuItem,
    PredefinedMenuItem,
    Submenu,
} from "@tauri-apps/api/menu"
import { open } from "@tauri-apps/plugin-dialog"
import { exit } from "@tauri-apps/plugin-process"
import { subscribe } from "valtio"
import { toggleColorMode } from "./components/ui/color-mode"
import AppStore from "./hooks/appState"
import { ImageItem } from "./metadata/state/ImageItem"
import { loadImage2 } from "./metadata/state/imageLoaders"
import { addImageItem, clearAll, clearCurrent } from "./metadata/state/metadataStore"
import { postMessage } from "./state/Messages"
import { getSetting, subscribeSetting, updateSetting } from "./state/settings"
import { themeHelpers } from "./theme/helpers"
import { viewDescription } from "./views"

const Separator = () => PredefinedMenuItem.new({ item: "Separator" })

let lastOpts: CreateOptionMenuOpts

async function createAppMenus() {
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

    const _global = globalThis as unknown as { _menuUnsubscribe?: () => void }
    if (_global._menuUnsubscribe) _global._menuUnsubscribe()

    const clearHistoryUnsub = subscribeSetting("metadata.clearHistoryOnExit", async () => {
        await updateMenu()
    })
    const clearPinsUnsub = subscribeSetting("metadata.clearPinsOnExit", async () => {
        await updateMenu()
    })

    _global._menuUnsubscribe = () => {
        clearHistoryUnsub()
        clearPinsUnsub()
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
                            {
                                name: "Image",
                                extensions: ["jpg", "jpeg", "png", "tiff", "webp", "gif", "bmp"],
                            },
                        ],
                    })
                    if (imagePath == null) return
                    const item = await ImageItem.fromFile(imagePath, {
                        loadedFrom: "open",
                        file: imagePath,
                    })
                    if (item) addImageItem(item)
                },
            }),
            await MenuItem.new({
                text: "Open from pasteboard...",
                id: "file_openPasteboard",
                action: async () => {
                    await loadImage2("general")
                },
            }),
            await Separator(),
            await MenuItem.new({
                text: "Close",
                id: "file_close",
                action: async () => {
                    await clearCurrent()
                },
            }),
            await MenuItem.new({
                text: "Close unpinned",
                id: "file_closeUnpinned",
                action: async () => {
                    await clearAll(true)
                },
            }),
            await MenuItem.new({
                text: "Close all",
                id: "file_closeAll",
                action: async () => {
                    await clearAll(false)
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
            ...(await Promise.all(
                viewDescription.map(async (view) => {
                    return await MenuItem.new({
                        text: view.label,
                        id: `view-${view.viewId}`,
                        action: async () => {
                            updateSetting("app.currentView", view.viewId)
                        },
                    })
                }),
            )),
            await Separator(),
        ],
        // items: [
        // 	await MenuItem.new({
        // 		text: "Metadata",
        // 		id: "view-metadata",
        // 		action: async () => {
        // 			AppStore.setView("metadata")
        // 		},
        // 	}),
        // 	await MenuItem.new({
        // 		text: "Vid",
        // 		id: "view-vid",
        // 		action: async () => {
        // 			AppStore.setView("vid")
        // 		},
        // 	}),
        // 	await MenuItem.new({
        // 		text: "Library",
        // 		id: "view-library",
        // 		action: async () => {
        // 			AppStore.setView("library")
        // 		},
        // 	}),
        // 	await MenuItem.new({
        // 		text: "Scratch",
        // 		id: "view-scratch",
        // 		action: async () => {
        // 			AppStore.setView("scratch")
        // 		},
        // 	}),
        // ],
    })
    const menus = [aboutSubmenu, fileSubmenu, editSubmenu, await createOptionsMenu(lastOpts)]
    if (import.meta.env.DEV) menus.push(viewSubmenu)

    return menus
}

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
                    updateSetting("metadata.clearPinsOnExit", !opts?.clearPinsOnExit)
                },
            }),
            await CheckMenuItem.new({
                text: "Clear history on exit",
                id: "options_clearHistoryOnExit",
                checked: opts?.clearHistoryOnExit,
                action: async () => {
                    updateSetting("metadata.clearHistoryOnExit", !opts?.clearHistoryOnExit)
                },
            }),
        ],
    })
}

export async function updateMenu(opts?: CreateOptionMenuOpts) {
    lastOpts = opts ?? (await createOpts())
    const menus = await createAppMenus()
    const menu = await Menu.new({
        items: menus,
    })

    await menu.setAsAppMenu()
}

async function createOpts(): Promise<CreateOptionMenuOpts> {
    return {
        clearHistoryOnExit: getSetting("metadata.clearHistoryOnExit"),
        clearPinsOnExit: getSetting("metadata.clearPinsOnExit"),
    }
}
