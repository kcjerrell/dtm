import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import type { ImageSelector } from "../controls"
import { createProjectCommands } from "../project"
import { createRunCommands, createRunEventSource } from "../run"

export const projectCommands = createProjectCommands(invoke)
export const runCommands = createRunCommands(invoke)
export const runEvents = createRunEventSource(listen, "script-run-event")

export function scriptInputSelector(getImageId: () => number | undefined): ImageSelector {
    return ({ inputId }) => {
        const imageId = getImageId()
        return imageId === undefined
            ? invoke("pick_script_input", { inputId })
            : invoke("select_script_draw_things_input", { inputId, imageId })
    }
}

export const revokeScriptInput = (selectionToken: string) =>
    invoke<void>("revoke_script_input", { selectionToken })

export function scriptPreviewUrl(url: string): string {
    return isTauri() ? url : convertFileSrc(url, "script-preview")
}
