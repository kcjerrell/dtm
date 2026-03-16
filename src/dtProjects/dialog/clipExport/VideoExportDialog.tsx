import { Box, Grid, HStack, Text, VStack } from "@chakra-ui/react"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { save } from "@tauri-apps/plugin-dialog"
import { useEffect, useMemo, useState } from "react"
import { createVideoFromFrames, type ImageExtra } from "@/commands"
import DTPService from "@/commands/DtpService"
import {
    IconButton,
    LinkButton,
    Panel,
    PanelButton,
    PanelSection,
    PanelSectionHeader,
} from "@/components"
import { FiX } from "@/components/icons/icons"
import { Checkbox } from "@/components/ui/checkbox"
import { NumberInputField, NumberInputRoot } from "@/components/ui/number-input"
import { useDTP } from "@/dtProjects/state/context"
import { useFfmpeg } from "@/hooks/useFfmpeg"
import type { RootElement } from "@/hooks/useRootElement"
import ExportProgress from "./ExportProgress"

export type FrameSource = "preview" | "tensor"

interface VideoExportDialogProps {
    onClose: () => void
    root: RootElement
    image: ImageExtra
}

function VideoExportDialog(props: VideoExportDialogProps) {
    const { onClose, image, root, ...restProps } = props
    const { settings: storage } = useDTP()
    const storageSnap = storage.useSnap()

    const defaultWidth = image.start_width * 64
    const defaultHeight = image.start_height * 64
    const scaleFactor = image.upscaler_scale_factor ?? 1
    const frameCount = image.num_frames ?? 0

    const [width, setWidth] = useState(defaultWidth)
    const [height, setHeight] = useState(defaultHeight)
    const [fps, setFps] = useState(25)
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

    useEffect(() => {
        if (!image || !image.clip_id) return
        DTPService.getClip(image.id, image.clip_id).then(async (data) => {
            if (!image) return
            setFps(data.clip.framesPerSecond)
        })
    }, [image])

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
        <Panel
            padding={3}
            width={"32rem"}
            className={"panel-scroll"}
            overflowY={"auto"}
            bgColor={"bg.1"}
            {...restProps}
        >
            <VStack alignItems={"stretch"} gap={2} justifyContent={"flex-start"}>
                <HStack width={"100%"} justifyContent={"space-between"}>
                    <Text paddingX={2} fontSize={"md"} fontWeight={"600"}>
                        Export Video
                    </Text>
                    <IconButton
                        role={"button"}
                        aria-label={"close settings"}
                        flex={"0 0 auto"}
                        size="min"
                        onClick={() => onClose()}
                    >
                        <FiX />
                    </IconButton>
                </HStack>

                <PanelSection variant={"dialog"} asChild>
                    <Grid
                        display={"grid"}
                        gridTemplateColumns={"1fr 1fr"}
                        // bgColor={"grayc.15"}
                        // _dark={{ bgColor: "grayc.13" }}
                        paddingX={4}
                        paddingY={2}
                        // borderRadius={"lg"}
                        // variant={"inset"}
                    >
                        <VStack alignItems="stretch" gap={3} paddingRight={4}>
                            <VStack alignItems={"stretch"}>
                                <PanelSectionHeader padding={0}>Size</PanelSectionHeader>
                                <HStack>
                                    <NumberInputRoot
                                        layerStyle={"borderA"}
                                        variant={"subtle"}
                                        value={width.toString()}
                                        onValueChange={(e: { value: string | null }) =>
                                            handleWidthChange(
                                                parseInt(e.value || "0") || defaultWidth,
                                            )
                                        }
                                        min={64}
                                        max={4096}
                                        step={8}
                                    >
                                        <NumberInputField
                                            textAlign={"center"}
                                            paddingRight={"2rem"}
                                        />
                                    </NumberInputRoot>
                                    <Text fontSize={"md"}>x</Text>
                                    <NumberInputRoot
                                        data-testid="height-input"
                                        layerStyle={"borderA"}
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
                            gap={2}
                            borderLeft={"1px solid"}
                            borderColor={"gray/20"}
                            paddingLeft={4}
                        >
                            <PanelSectionHeader padding={0}>Frame Rate</PanelSectionHeader>
                            <HStack gap={4} alignItems={"center"}>
                                <Box flex={1}>
                                    <NumberInputRoot
                                        layerStyle={"borderA"}
                                        variant={"subtle"}
                                        value={fps.toString()}
                                        onValueChange={(e: { value: string | null }) => {
                                            const nextVal = parseInt(e.value || "0") || 1
                                            // If the difference is exactly 2 or 1, it's likely a step from the trigger.
                                            // We snap to the next/prev even number in that case.
                                            const diff = nextVal - fps
                                            if (Math.abs(diff) === 2 || Math.abs(diff) === 1) {
                                                if (diff > 0) {
                                                    setFps(
                                                        nextVal % 2 === 0 ? nextVal : nextVal - 1,
                                                    )
                                                } else {
                                                    setFps(
                                                        nextVal % 2 === 0 ? nextVal : nextVal + 1,
                                                    )
                                                }
                                            } else {
                                                setFps(nextVal)
                                            }
                                        }}
                                        min={1}
                                        max={120}
                                        step={2}
                                    >
                                        <NumberInputField />
                                    </NumberInputRoot>
                                </Box>
                                <Box flex={1}>
                                    <Text fontSize="xs" fontWeight="600" color={"fg.muted"}>
                                        Duration
                                    </Text>
                                    <Text fontSize="sm" paddingTop={1}>
                                        {duration}s
                                    </Text>
                                </Box>
                            </HStack>
                        </VStack>
                    </Grid>
                </PanelSection>

                <PanelSection variant={"dialog"} asChild>
                    <VStack paddingX={4} paddingY={2} gap={1} alignItems={"stretch"}>
                        <PanelSectionHeader>Frame Source</PanelSectionHeader>
                        <VStack alignItems="stretch" gap={1} paddingX={2}>
                            <HStack
                                gap={0}
                                padding={0}
                                bgColor="bg.2"
                                borderRadius="lg"
                                layerStyle={"borderA"}
                            >
                                <PanelButton
                                    flex={1}
                                    size="sm"
                                    tone={frameSource === "preview" ? "selected" : "none"}
                                    onClick={() => setFrameSource("preview")}
                                    borderRadius="md"
                                    borderRightRadius={0}
                                >
                                    Preview
                                </PanelButton>
                                <PanelButton
                                    flex={1}
                                    size="sm"
                                    tone={frameSource === "tensor" ? "selected" : "none"}
                                    onClick={() => setFrameSource("tensor")}
                                    borderRadius="md"
                                    borderLeftRadius={0}
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
                    <PanelButton disabled={!ffmpeg.isReady || isExporting} onClick={handleExport}>
                        Export
                    </PanelButton>
                </HStack>
            </VStack>
        </Panel>
    )
}

export default VideoExportDialog
