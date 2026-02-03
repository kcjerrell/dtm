import { store } from "@tauri-store/valtio"
import { resolveBookmark, stopAccessingBookmark } from "@/commands"
import { DTPStateController } from "./types"

type SettingsControllerState = {
    export: {
        framesFilenamePattern: string
        framesOutputDir: string
        framesSource: "preview" | "tensor"
        videoSource: "preview" | "tensor"
        videoFps: number
    }
    permissions: {
        bookmark: string | null
    }
    models: {
        lastUpdated: string
    }
}

const defaultState: SettingsControllerState = {
    export: {
        framesFilenamePattern: "clip_%%%_frame_###",
        framesOutputDir: "",
        framesSource: "preview",
        videoSource: "preview",
        videoFps: 16,
    },
    permissions: {
        bookmark: null,
    },
    models: {
        lastUpdated: new Date(0).toISOString(),
    },
}

const settingsStore = store("dtp-settings", defaultState, {
    autoStart: true,
    saveOnChange: true,
    saveStrategy: "immediate",
    syncStrategy: "immediate",
})

class SettingsController extends DTPStateController<SettingsControllerState> {
    state = settingsStore.state

    constructor() {
        super("settings")
        console.log("does bookmark exist?", !!this.state.permissions.bookmark)
    }

    updateSetting<
        G extends keyof SettingsControllerState,
        K extends keyof SettingsControllerState[G],
    >(group: G, key: K, value: SettingsControllerState[G][K]) {
        this.state[group][key] = value
    }

    async setBookmark(bookmark: string) {
        await this.clearBookmark()

        this.state.permissions.bookmark = bookmark
        await resolveBookmark(bookmark)
    }

    async clearBookmark() {
        const currentBookmark = this.state.permissions.bookmark
        if (currentBookmark) {
            await stopAccessingBookmark(currentBookmark)
        }

        this.state.permissions.bookmark = null
    }
}

export default SettingsController
