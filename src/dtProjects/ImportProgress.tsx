import { Box, CloseButton, Dialog, Portal } from "@chakra-ui/react"
import { motion } from "motion/react"
import { Progress } from "@/components"

type ImportProgressProps = {
    open: boolean
    progress?: {
        found: number
        scanned: number
        imageCount: number
    }
}

const ImportProgress = (props: ImportProgressProps) => {
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
                        <Dialog.CloseTrigger asChild>
                            <CloseButton size="sm" />
                        </Dialog.CloseTrigger>
                    </Dialog.Content>
                </Dialog.Positioner>
            </Portal>
        </Dialog.Root>
    )
}

export default ImportProgress
