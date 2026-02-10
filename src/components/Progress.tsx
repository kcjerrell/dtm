import { Box, Progress as ChakraProgress, HStack, Spacer } from "@chakra-ui/react"
import { forwardRef } from "react"

export interface ProgressProps extends ChakraProgress.RootProps {
    showValueText?: boolean
    valueText?: React.ReactNode
    labelA?: React.ReactNode
    labelB?: React.ReactNode
}

const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress(props, ref) {
    const { showValueText, valueText, labelA, labelB, ...rest } = props
    return (
        <ChakraProgress.Root {...rest} ref={ref}>
            {labelA && (
                <ChakraProgress.Label width={"full"} asChild>
                    <HStack paddingX={0.5}>
                        <Box>{labelA}</Box>
                        <Spacer />
                        <Box>{labelB}</Box>
                    </HStack>
                </ChakraProgress.Label>
            )}
            <ChakraProgress.Track marginY={0.5}>
                <ChakraProgress.Range bgColor={"highlight"} />
            </ChakraProgress.Track>
            {showValueText && <ChakraProgress.ValueText>{valueText}</ChakraProgress.ValueText>}
        </ChakraProgress.Root>
    )
})

export default Progress
