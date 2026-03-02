import { Box, Dialog, Portal } from "@chakra-ui/react"
import { motion } from "motion/react"
import { Progress } from "@/components"
import { useDTP } from './state/context'

type ImportProgressProps = {
    open: boolean
    progress?: {
        found: number
        scanned: number
        imageCount: number
    }
}

const ImportProgressInner = (props: ImportProgressProps) => {
    const { open, progress } = props

    if (!open || !progress) return null

    const { found, scanned, imageCount } = progress

    return (
        <Dialog.Root lazyMount open={open} size={"sm"} placement={"center"}>
            <Portal>
                <Dialog.Backdrop />
                <Dialog.Positioner>
                    <Dialog.Content>
                        <Dialog.Header>
                            <Dialog.Title>Scanning projects...</Dialog.Title>
                        </Dialog.Header>
                        <Dialog.Body>
                            <Progress
                                labelA={`${scanned} projects scanned...`}
                                labelB={`${found} projects found`}
                                value={found > 0 ? (100 * scanned) / found : 0}
                            />
                            <Box>
                                <motion.span style={{ marginRight: "1rem" }}>
                                    {imageCount}
                                </motion.span>
                                images scanned
                            </Box>
                        </Dialog.Body>
                    </Dialog.Content>
                </Dialog.Positioner>
            </Portal>
        </Dialog.Root>
    )
}

const ImportProgress = (props: ChakraProps) => {
    const { uiState } = useDTP()
    const uiSnap = uiState.useSnap()

    return (
        <ImportProgressInner
            open={uiSnap.importLock}
            progress={uiSnap.importProgress}
            key={`import-lock-${uiSnap.importLockCount}`}
            {...props}
        />
    )
}

export default ImportProgress
