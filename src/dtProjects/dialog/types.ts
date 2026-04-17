import type { ImageExtra } from "@/commands"

export type VideoExportDialogState = {
    dialogType: "clip-export-video"
    props: {
        image: ImageExtra
    }
}

export type FrameExportDialogState = {
    dialogType: "clip-export-frames"
    props: {
        image: ImageExtra
    }
}

export type SettingsDialogState = {
    dialogType: "settings"
    props: Record<string, unknown>
}

export type ExplorerDialogState = {
    dialogType: "explorer"
    props: Record<string, unknown>
}

type UnknownDialogState = {
    dialogType: "unknown"
    props: Record<string, unknown>
}

export interface DialogPropsBase extends ChakraProps {
    onClose: () => void
}

export type DialogProps<T extends DialogState = UnknownDialogState> = DialogPropsBase & T["props"]

export type DialogState =
    | VideoExportDialogState
    | FrameExportDialogState
    | SettingsDialogState
    | ExplorerDialogState
    | UnknownDialogState
