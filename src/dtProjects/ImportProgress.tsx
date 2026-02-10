import { Box, CloseButton, Dialog, Portal } from "@chakra-ui/react"
import { motion } from "motion/react"
import { Progress } from "@/components"
import { useDTP } from "./state/context"

const ImportProgress = (props: { open: boolean }) => {
    const { open } = props

    const { projects } = useDTP()
    const projectsSnap = projects.useSnap()

    const found = projectsSnap.projects.length
    const scanned = projectsSnap.projects.filter((p) => (p.filesize ?? 0) > 0).length
    const imageCount = projectsSnap.projects.reduce((acc, p) => acc + (p.image_count ?? 0), 0)

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
