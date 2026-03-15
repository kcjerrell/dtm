import { VStack } from "@chakra-ui/react"
import { PanelSection, PanelSectionHeader, Progress } from "@/components"

interface ExportProgressProps extends ChakraProps {
    finished: number
    total: number
    progressText: string
    videoFinished?: number
    videoTotal?: number
    videoProgressText?: string
}

function ExportProgress(props: ExportProgressProps) {
    const {
        finished,
        total,
        progressText,
        videoFinished,
        videoTotal,
        videoProgressText,
        ...restProps
    } = props

    const videoValue =
        videoTotal && videoTotal > 0 && videoFinished !== undefined
            ? Math.round((videoFinished / videoTotal) * 100)
            : 0

    return (
        <PanelSection paddingY={2} {...restProps}>
            <PanelSectionHeader>Progress</PanelSectionHeader>
            <VStack alignItems="stretch" gap={4} paddingX={4} paddingY={2}>
                <Progress
                    valueText={progressText}
                    labelA={progressText}
                    labelB={`${finished} / ${total}`}
                    showValueText={false}
                    value={total > 0 ? (finished / total) * 100 : 0}
                />

                {videoProgressText !== undefined && (
                    <Progress
                        valueText={videoProgressText}
                        labelA={videoProgressText}
                        labelB={`${videoValue}%`}
                        showValueText={false}
                        value={videoValue}
                    />
                )}
            </VStack>
        </PanelSection>
    )
}

export default ExportProgress
