import { Box } from "@chakra-ui/react"
import { lazy, Suspense } from "react"
import { useDTP } from "../state/context"
import { ContentPanelPopup } from "../imagesList/ContentPanelPopup"
import { useRootElement, useRootElementRef } from "@/hooks/useRootElement"
import VideoExportDialog from "./clipExport/VideoExportDialog"
import FramesExportDialog from "./clipExport/FramesExportDialog"

function getDialogComponent(dialogType: string) {
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

    const rootElement = useRootElementRef(uiSnap?.dialog?.root)

    if (!uiSnap.dialog) return null

    const Dialog = getDialogComponent(uiSnap.dialog.dialogType)
    if (!Dialog) return null

    return (
        <ContentPanelPopup
            shadeElem={rootElement}
            onClose={() => {
                uiState.hideDialog()
            }}
            flexDir={"column"}
            panelProps={{
                height: "auto",
                maxHeight: "80vh",
                overflowY: "auto",
                className: "panel-scroll",
                padding: 0,
                scrollbarGutter: "auto"
            }}
            height={"auto"}
            shadeProps={{
                bgColor: "#22222266",
            }}
        >
            <Box {...restProps}>
                <Dialog
                    onClose={() => {
                        uiState.hideDialog()
                    }}
                    {...uiSnap.dialog}
                />
            </Box>
        </ContentPanelPopup>
    )
}

export default DialogPresenter
