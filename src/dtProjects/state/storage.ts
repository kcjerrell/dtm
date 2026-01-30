import { store } from "@tauri-store/valtio"
import { DTPStateController } from "./types"

type StorageControllerState = {
    export: {
        framesFilenamePattern: string
        framesOutputDir: string
        framesSource: "preview" | "tensor"
        videoSource: "preview" | "tensor"
        videoFps: number
    }
}

const defaultState: StorageControllerState = {
    export: {
        framesFilenamePattern: "clip_%%%_frame_###",
        framesOutputDir: "",
        framesSource: "preview",
        videoSource: "preview",
        videoFps: 16,
    },
}

const settingsStore = store("dtp-storage", defaultState, {
    autoStart: true,
    saveOnChange: true,
})

class StorageController extends DTPStateController<StorageControllerState> {
    state = settingsStore.state

    constructor() {
        super("storage")
    }

    updateSetting<
        G extends keyof StorageControllerState,
        K extends keyof StorageControllerState[G],
    >(group: G, key: K, value: StorageControllerState[G][K]) {
        this.state[group][key] = value
    }
}

export default StorageController
