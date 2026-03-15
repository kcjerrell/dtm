import type { ImageExtra } from "@/commands"

export type VideoExportDialogState = {
    dialogType: "clip-export-video"
    image: ImageExtra
}

export type FrameExportDialogState = {
    dialogType: "clip-export-frames"
    image: ImageExtra
}

export type DialogState = VideoExportDialogState | FrameExportDialogState
