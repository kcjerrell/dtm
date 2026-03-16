import type { ImageExtra } from "@/commands"
import type { RootElement } from "@/hooks/useRootElement"

export type VideoExportDialogState = {
    dialogType: "clip-export-video"
    image: ImageExtra
    root: RootElement
}

export type FrameExportDialogState = {
    dialogType: "clip-export-frames"
    image: ImageExtra
    root: RootElement
}

export type DialogState = VideoExportDialogState | FrameExportDialogState
