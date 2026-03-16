import { Flex } from "@chakra-ui/react"
import { useDTP } from "../state/context"
import FramesExportDialog from "./clipExport/FramesExportDialog"
import VideoExportDialog from "./clipExport/VideoExportDialog"

function getDialogComponent(dialogType: Nullable<string>) {
    switch (dialogType) {
        case "clip-export-video":
            return VideoExportDialog
        case "clip-export-frames":
            return FramesExportDialog
        default:
            return null
    }
}

interface DialogPresenterComponentProps extends ChakraProps {}

function DialogPresenter(props: DialogPresenterComponentProps) {
    const { ...restProps } = props
    const { uiState } = useDTP()
    const uiSnap = uiState.useSnap()

    const Dialog = getDialogComponent(uiSnap.dialog?.dialogType)
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
                <Dialog
                    onClose={() => {
                        uiState.hideDialog()
                    }}
                    {...uiSnap.dialog}
                />
            </Flex>
        </Flex>
    )
}

export default DialogPresenter
