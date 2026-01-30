import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { save } from "@tauri-apps/plugin-dialog"
import { type RefObject, useMemo, useState } from "react"
import { createVideoFromFrames, type ImageExtra } from "@/commands"
import { LinkButton, PanelButton, PanelSection, PanelSectionHeader } from "@/components"
import { Checkbox } from "@/components/ui/checkbox"
import { NumberInputField, NumberInputRoot } from "@/components/ui/number-input"
import { Radio, RadioGroup } from "@/components/ui/radio"
import { useDTP } from "@/dtProjects/state/context"
import { useFfmpeg } from "@/hooks/useFfmpeg"
import { ContentPanelPopup } from "../../imagesList/ContentPanelPopup"
import ExportProgress from "./ExportProgress"

export type FrameSource = "preview" | "tensor"

interface VideoExportDialogProps {
    onClose: () => void
    rootElement?: RefObject<HTMLDivElement | null>
    image: ImageExtra
}

export function VideoExportDialog(props: VideoExportDialogProps) {
    const { onClose, image } = props
    const { storage } = useDTP()
    const storageSnap = storage.useSnap()

    const defaultWidth = image.start_width * 64
    const defaultHeight = image.start_height * 64
    const scaleFactor = image.upscaler_scale_factor ?? 1
    const frameCount = image.num_frames ?? 0

    const [width, setWidth] = useState(defaultWidth)
    const [height, setHeight] = useState(defaultHeight)
    const [fps, setFps] = useState(storageSnap.export.videoFps ?? 16)
    const [fpsMode, setFpsMode] = useState<string>(
        storageSnap.export.videoFps === 16
            ? "16"
            : storageSnap.export.videoFps === 24
              ? "24"
              : "custom",
    )
    const [frameSource, setFrameSource] = useState<FrameSource>(storageSnap.export.videoSource)
    const [lockAspectRatio, setLockAspectRatio] = useState(true)

    const [isExporting, setIsExporting] = useState(false)
    const [framesProgress, setFramesProgress] = useState({
        finished: 0,
        total: 0,
        text: "",
    })
    const [videoProgress, setVideoProgress] = useState({
        finished: 0,
        total: 0,
        text: "",
    })

    const ffmpeg = useFfmpeg()

    const aspectRatio = useMemo(() => defaultWidth / defaultHeight, [defaultWidth, defaultHeight])

    let originalW = defaultWidth
    let originalH = defaultHeight
    if (scaleFactor && frameSource === "tensor") {
        originalW = defaultWidth * scaleFactor
        originalH = defaultHeight * scaleFactor
    }
    const showUseSizeButton = width !== originalW || height !== originalH

    const handleWidthChange = (val: number) => {
        setWidth(val)
        if (lockAspectRatio) {
            setHeight(Math.round(val / aspectRatio))
        }
    }

    const handleHeightChange = (val: number) => {
        setHeight(val)
        if (lockAspectRatio) {
            setWidth(Math.round(val * aspectRatio))
        }
    }

    const handleFpsModeChange = (val: string) => {
        setFpsMode(val)
        if (val === "16") setFps(16)
        if (val === "24") setFps(24)
    }

    const handleExport = async () => {
        storage.updateSetting("export", "videoFps", fps)
        storage.updateSetting("export", "videoSource", frameSource)

        const savePath = await save({
            canCreateDirectories: true,
            title: "Save video",
            filters: [{ name: "Video", extensions: ["mp4"] }],
        })
        if (!savePath) return

        setIsExporting(true)
        setFramesProgress({ finished: 0, total: frameCount, text: "Initializing..." })
        setVideoProgress({ finished: 0, total: 100, text: "" })

        let unlistenFrames: UnlistenFn | undefined
        let unlistenVideo: UnlistenFn | undefined
        try {
            unlistenFrames = await listen<{ current: number; total: number; msg: string }>(
                "export_frames_progress",
                (event) => {
                    setFramesProgress({
                        finished: event.payload.current,
                        total: event.payload.total,
                        text: event.payload.msg,
                    })
                },
            )

            unlistenVideo = await listen<{ current: number; total: number; msg: string }>(
                "export_video_progress",
                (event) => {
                    setVideoProgress({
                        finished: event.payload.current,
                        total: event.payload.total,
                        text: event.payload.msg,
                    })
                },
            )

            await createVideoFromFrames({
                width,
                height,
                fps,
                // outFps: 60,
                useTensor: frameSource === "tensor",
                outputFile: savePath,
                imageId: image.id,
            })
        } catch (e) {
            console.error("Export failed", e)
            setVideoProgress((prev) => ({ ...prev, text: "Export failed" }))
        } finally {
            if (unlistenFrames) unlistenFrames()
            if (unlistenVideo) unlistenVideo()
            setIsExporting(false)
        }
    }

    const duration = frameCount > 0 ? (frameCount / fps).toFixed(1) : "0.0"

    return (
        <ContentPanelPopup
            // shadeElem={rootElement}
            onClose={onClose}
            flexDir={"column"}
            shadeProps={{
                pointerEvents: "auto",
                bgColor: "#00000044",
                // backdropFilter: "blur(4px)",
            }}
            panelProps={{
                height: "auto",
            }}
            height={"auto"}
        >
            <VStack
                padding={2}
                flex="1 1 auto"
                alignItems="stretch"
                justifyContent={"flex-start"}
                gap={2}
            >
                <Text paddingX={2} fontSize={"md"} fontWeight={"600"}>
                    Export Video
                </Text>

                <PanelSection display={"grid"} gridTemplateColumns={"1fr 1fr"} bgColor={"bg.2"}>
                    <VStack alignItems="stretch" gap={3} paddingX={4} paddingY={3}>
                        <VStack alignItems={"stretch"}>
                            <PanelSectionHeader padding={0}>Size</PanelSectionHeader>
                            <HStack>
                                <NumberInputRoot
                                    variant={"subtle"}
                                    value={width.toString()}
                                    onValueChange={(e: { value: string | null }) =>
                                        handleWidthChange(parseInt(e.value || "0") || defaultWidth)
                                    }
                                    min={64}
                                    max={4096}
                                    step={8}
                                >
                                    <NumberInputField textAlign={"center"} paddingRight={"2rem"} />
                                </NumberInputRoot>
                                <Text fontSize={"md"}>x</Text>
                                <NumberInputRoot
                                    data-testid="height-input"
                                    variant={"subtle"}
                                    value={height.toString()}
                                    onValueChange={(e: { value: string | null }) =>
                                        handleHeightChange(
                                            parseInt(e.value || "0") || defaultHeight,
                                        )
                                    }
                                    min={64}
                                    max={4096}
                                    step={8}
                                >
                                    <NumberInputField />
                                </NumberInputRoot>
                            </HStack>
                        </VStack>
                        <Checkbox
                            alignSelf={"center"}
                            variant={"subtle"}
                            checked={lockAspectRatio}
                            onCheckedChange={(e) => setLockAspectRatio(!!e.checked)}
                            size="sm"
                        >
                            Lock aspect ratio
                        </Checkbox>
                    </VStack>
                    <VStack
                        alignItems="stretch"
                        gap={3}
                        paddingX={4}
                        paddingY={3}
                        borderLeft={"1px solid"}
                        borderColor={"gray/20"}
                    >
                        <PanelSectionHeader padding={0}>Frame Rate</PanelSectionHeader>
                        <RadioGroup
                            value={fpsMode}
                            onValueChange={(e: { value: string | null }) =>
                                handleFpsModeChange(e.value || "custom")
                            }
                            variant={"subtle"}
                            size={"sm"}
                        >
                            <HStack gap={4}>
                                <Radio value="16">16</Radio>
                                <Radio value="24">24</Radio>
                                <Radio value="custom">Custom</Radio>
                            </HStack>
                        </RadioGroup>
                        <HStack gap={4} alignItems={"center"}>
                            <Box flex={1}>
                                <Text fontSize="xs" fontWeight="600" color={"fg.muted"}>
                                    Duration
                                </Text>
                                <Text fontSize="sm">{duration}s</Text>
                            </Box>
                            <NumberInputRoot
                                flex={1}
                                variant={"subtle"}
                                value={fps.toString()}
                                onValueChange={(e: { value: string | null }) => {
                                    const val = parseInt(e.value || "0") || 1
                                    setFps(val)
                                    if (val !== 16 && val !== 24) setFpsMode("custom")
                                }}
                                min={1}
                                max={60}
                                disabled={fpsMode !== "custom"}
                                showScrubber={false}
                            >
                                <NumberInputField />
                            </NumberInputRoot>
                        </HStack>
                    </VStack>
                </PanelSection>

                <PanelSection>
                    <PanelSectionHeader>Frame Source</PanelSectionHeader>
                    <VStack alignItems="stretch" gap={1} paddingX={4} paddingY={2}>
                        <HStack
                            gap={2}
                            padding={0}
                            bgColor="bg.2"
                            borderRadius="lg"
                            border="1px solid {colors.gray/10}"
                        >
                            <PanelButton
                                flex={1}
                                size="sm"
                                tone={frameSource === "preview" ? "selected" : "none"}
                                onClick={() => setFrameSource("preview")}
                                borderRadius="md"
                            >
                                Preview
                            </PanelButton>
                            <PanelButton
                                flex={1}
                                size="sm"
                                tone={frameSource === "tensor" ? "selected" : "none"}
                                onClick={() => setFrameSource("tensor")}
                                borderRadius="md"
                            >
                                Tensor
                            </PanelButton>
                        </HStack>
                        <Text fontSize="sm" color="fg.1">
                            Source size: {originalW} x {originalH}
                            <LinkButton
                                show={showUseSizeButton}
                                onClick={() => {
                                    setWidth(originalW)
                                    setHeight(originalH)
                                }}
                            >
                                Use this size
                            </LinkButton>
                        </Text>
                        <Text fontSize="sm" color="fg.1">
                            {frameSource === "preview"
                                ? "Fast - uses the high quality, preview image for each frame.  (This uses the same images as the video preview)."
                                : "Slow, best quality, uses original generated tensor output."}
                        </Text>
                        {scaleFactor && scaleFactor > 1 && (
                            <Text fontSize="sm" color="fg.1">
                                Note: Upscaled videos must use the Tensor source for full
                                resolution.
                            </Text>
                        )}
                    </VStack>
                </PanelSection>

                <ffmpeg.FfmpegComponent />
                {(isExporting ||
                    videoProgress.text === "Done" ||
                    videoProgress.text === "Export failed") && (
                    <ExportProgress
                        finished={framesProgress.finished}
                        total={framesProgress.total}
                        progressText={framesProgress.text}
                        videoFinished={videoProgress.finished}
                        videoTotal={videoProgress.total}
                        videoProgressText={videoProgress.text || undefined}
                    />
                )}
                <HStack justifyContent="flex-end" gap={2} marginTop={2}>
                    <Button variant="outline" onClick={onClose} disabled={isExporting}>
                        {videoProgress.text === "Done" ? "Close" : "Cancel"}
                    </Button>
                    <PanelButton disabled={!ffmpeg.isReady || isExporting} onClick={handleExport}>
                        Export
                    </PanelButton>
                </HStack>
            </VStack>
        </ContentPanelPopup>
    )
}
