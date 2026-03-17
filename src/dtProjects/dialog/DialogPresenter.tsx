import { Flex } from "@chakra-ui/react"
import type { JSX } from "react"
import { Panel } from "@/components"
import { SettingsPanel } from "../settingsPanel/SettingsPanel"
import { useDTP } from "../state/context"
import FramesExportDialog from "./clipExport/FramesExportDialog"
import VideoExportDialog from "./clipExport/VideoExportDialog"
import type { DialogProps, DialogState } from "./types"

const _dialogs: Record<string, (props: DialogProps) => JSX.Element> = {
    "clip-export-video": VideoExportDialog as unknown as (props: DialogProps) => JSX.Element,
    "clip-export-frames": FramesExportDialog as unknown as (props: DialogProps) => JSX.Element,
    settings: SettingsPanel as unknown as (props: DialogProps) => JSX.Element,
}

function getDialogComponent(dialog?: DialogState) {
    if (!dialog || !(dialog.dialogType in _dialogs)) return { Dialog: null, dialogProps: null }
    const { dialogType, props } = dialog
    const Dialog = _dialogs[dialogType]

    return { Dialog, dialogProps: props }
}

interface DialogPresenterComponentProps extends ChakraProps {}

function DialogPresenter(props: DialogPresenterComponentProps) {
    const { ...restProps } = props
    const { uiState } = useDTP()
    const uiSnap = uiState.useSnap()

    const { Dialog, dialogProps } = getDialogComponent(uiSnap.dialog)
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
                {...restProps}
            >
                <Panel
                    padding={3}
                    width={"28rem"}
                    className={"panel-scroll"}
                    overflowY={"auto"}
                    bgColor={"bg.1"}
                    {...restProps}
                >
                    <Dialog onClose={() => uiState.hideDialog()} {...dialogProps} />
                </Panel>
            </Flex>
        </Flex>
    )
}

export default DialogPresenter
