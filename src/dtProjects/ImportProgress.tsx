import {
    Box,
    Progress as ChakraProgress,
    CloseButton,
    Dialog,
    HStack,
    Portal,
    Spacer,
} from "@chakra-ui/react"
import { motion } from "motion/react"
import { forwardRef } from "react"
import { useDTP } from "./state/context"

const ImportProgress = (props: { open: boolean }) => {
    const { open } = props

    const { projects } = useDTP()
    const projectsSnap = projects.useSnap()

    const found = projectsSnap.projects.length
    const scanned = projectsSnap.projects.filter((p) => p.filesize > 0).length
    const imageCount = projectsSnap.projects.reduce((acc, p) => acc + p.image_count, 0)

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

interface ProgressProps extends ChakraProgress.RootProps {
    showValueText?: boolean
    valueText?: React.ReactNode
    labelA?: React.ReactNode
    labelB?: React.ReactNode
    info?: React.ReactNode
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress(props, ref) {
    const { showValueText, valueText, labelA, labelB, info, ...rest } = props
    return (
        <ChakraProgress.Root {...rest} ref={ref}>
            {labelA && (
                <ChakraProgress.Label width={"full"} asChild>
                    <HStack>
                        <Box>{labelA}</Box>
                        <Spacer />
                        <Box>{labelB}</Box>
                    </HStack>
                </ChakraProgress.Label>
            )}
            <ChakraProgress.Track>
                <ChakraProgress.Range />
            </ChakraProgress.Track>
            {showValueText && <ChakraProgress.ValueText>{valueText}</ChakraProgress.ValueText>}
        </ChakraProgress.Root>
    )
})

export default ImportProgress
