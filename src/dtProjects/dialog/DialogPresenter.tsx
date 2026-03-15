import { Box } from "@chakra-ui/react"
import { lazy, Suspense } from "react"
import { useDTP } from "../state/context"

function getDialogComponent(dialogType: string) {
    switch (dialogType) {
        case "clip-export-video":
            return lazy(() => import("./clipExport/VideoExportDialog"))
        case "clip-export-frames":
            return lazy(() => import("./clipExport/FramesExportDialog"))
        default:
            return null
    }
}

interface DialogPresenterComponentProps extends ChakraProps {}

function DialogPresenter(props: DialogPresenterComponentProps) {
    const { ...restProps } = props
    const { uiState } = useDTP()
    const uiSnap = uiState.useSnap()

    if (!uiSnap.dialog) return null

    const Dialog = getDialogComponent(uiSnap.dialog.dialogType)
    if (!Dialog) return null

    return (
        <Suspense fallback={null}>
            <Box {...restProps}>
                <Dialog onClose={() => {}} {...uiSnap.dialog} />
            </Box>
        </Suspense>
    )
}

export default DialogPresenter
