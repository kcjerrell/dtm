import { Flex } from "@chakra-ui/react"
import type { JSX } from "react"
import { Panel } from "@/components"
import Explorer from "../explorer"
import { SettingsPanel } from "../settingsPanel/SettingsPanel"
import { useDTP } from "../state/context"
import FramesExportDialog from "./clipExport/FramesExportDialog"
import VideoExportDialog from "./clipExport/VideoExportDialog"
import type { DialogProps, DialogState } from "./types"

type DialogComponent = (props: DialogProps) => JSX.Element
type DialogType = {
    Dialog: DialogComponent
    panelProps?: ChakraProps
    containerProps?: ChakraProps
}

const _dialogs: Record<string, DialogType> = {
    "clip-export-video": {
        Dialog: VideoExportDialog as unknown as DialogComponent,
        panelProps: {},
        containerProps: {},
    },
    "clip-export-frames": {
        Dialog: FramesExportDialog as unknown as DialogComponent,
        panelProps: {},
        containerProps: {},
    },
    settings: {
        Dialog: SettingsPanel as unknown as DialogComponent,
        panelProps: {},
        containerProps: {},
    },
    explorer: {
        Dialog: Explorer as unknown as DialogComponent,
        panelProps: { width: "full", height: "full" },
        containerProps: { width: "full", height: "full" },
    },
}

function getDialogComponent(dialog?: DialogState) {
    if (!dialog || !(dialog.dialogType in _dialogs)) return { Dialog: null, dialogProps: null }
    const { dialogType, props } = dialog
    const { Dialog, panelProps, containerProps } = _dialogs[dialogType]

    return { Dialog, dialogProps: props, panelProps, containerProps }
}

interface DialogPresenterComponentProps extends ChakraProps {}

function DialogPresenter(props: DialogPresenterComponentProps) {
    const { ...restProps } = props
    const { uiState } = useDTP()
    const uiSnap = uiState.useSnap()

    const { Dialog, dialogProps, panelProps, containerProps } = getDialogComponent(uiSnap.dialog)
    if (!Dialog) return null

    return (
        <Flex
            justifyContent={"center"}
            alignItems={"center"}
            position={"absolute"}
            inset={0}
            zIndex={50}
            bgColor={"#22222266"}
            onClick={() => {
                uiState.hideDialog()
            }}
            overflow={"hidden"}
        >
            <Flex
                overflow={"hidden"}
                maxHeight={"80vh"}
                maxWidth={"80vw"}
                onClick={(e) => e.stopPropagation()}
                {...containerProps}
            >
                <Panel
                    padding={3}
                    width={"28rem"}
                    className={"panel-scroll"}
                    overflowY={"auto"}
                    bgColor={"bg.1"}
                    role={"dialog"}
                    aria-modal="true"
                    {...panelProps}
                >
                    <Dialog onClose={() => uiState.hideDialog()} {...dialogProps} />
                </Panel>
            </Flex>
        </Flex>
    )
}

export default DialogPresenter
