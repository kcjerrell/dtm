import { store } from "@tauri-store/valtio"
import { DTPStateController } from "./types"

type SettingsControllerState = {
    export: {
        framesFilenamePattern: string
        framesOutputDir: string
        framesSource: "preview" | "tensor"
        videoSource: "preview" | "tensor"
        videoFps: number
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
    }

    updateSetting<
        G extends keyof SettingsControllerState,
        K extends keyof SettingsControllerState[G],
    >(group: G, key: K, value: SettingsControllerState[G][K]) {
        this.state[group][key] = value
    }
}

export default SettingsController
