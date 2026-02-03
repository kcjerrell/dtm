import { Button, Field, Grid, HStack, Input, Text, VStack } from "@chakra-ui/react"
import { path } from "@tauri-apps/api"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { open } from "@tauri-apps/plugin-dialog"
import { useDebounceEffect } from "ahooks"
import { type RefObject, useEffect, useState } from "react"
import { PiInfo } from "react-icons/pi"
import {
    type CheckPatternResult,
    checkPattern,
    type ImageExtra,
    saveAllClipFrames,
} from "@/commands"
import { PanelButton, PanelSection, PanelSectionHeader, Tooltip } from "@/components"
import { useDTP } from "@/dtProjects/state/context"
import { ContentPanelPopup } from "../../imagesList/ContentPanelPopup"
import ExportProgress from "./ExportProgress"

const defaultOutputDir = await path.documentDir()

export type FrameSource = "preview" | "tensor"

interface FramesExportDialogProps {
    onClose: () => void
    image: ImageExtra
    rootElement?: RefObject<HTMLDivElement | null>
}

export function FramesExportDialog(props: FramesExportDialogProps) {
    const { onClose, image, rootElement } = props

    const defaultWidth = image.start_width * 64
    const defaultHeight = image.start_height * 64
    const scaleFactor = image.upscaler_scale_factor ?? 1
    const frameCount = image.num_frames ?? 0

    const { settings: storage } = useDTP()
    const storageSnap = storage.useSnap()

    const [outputDir, setOutputDir] = useState(storageSnap.export.framesOutputDir)
    const [frameSource, setFrameSource] = useState<FrameSource>(storageSnap.export.framesSource)
    const [filenamePattern, setFilenamePattern] = useState(storageSnap.export.framesFilenamePattern)
    const [checkResult, setCheckResult] = useState<CheckPatternResult | null>(null)

    const [isExporting, setIsExporting] = useState(false)
    const [finishedFrames, setFinishedFrames] = useState(0)
    const [totalFrames, setTotalFrames] = useState(0)
    const [progressText, setProgressText] = useState("")

    let originalW = defaultWidth
    let originalH = defaultHeight
    if (scaleFactor && frameSource === "tensor") {
        originalW = defaultWidth * scaleFactor
        originalH = defaultHeight * scaleFactor
    }

    const handleExport = async () => {
        storage.updateSetting("export", "framesOutputDir", outputDir)
        storage.updateSetting("export", "framesSource", frameSource)
        storage.updateSetting("export", "framesFilenamePattern", filenamePattern)

        setIsExporting(true)
        setFinishedFrames(0)
        setTotalFrames(frameCount)
        setProgressText("Initializing...")

        let unlisten: UnlistenFn | undefined
        try {
            unlisten = await listen<{ current: number; total: number; msg: string }>(
                "export_frames_progress",
                (event) => {
                    setFinishedFrames(event.payload.current)
                    setTotalFrames(event.payload.total)
                    setProgressText(event.payload.msg)
                },
            )

            await saveAllClipFrames({
                imageId: image.id,
                useTensor: frameSource === "tensor",
                filenamePattern: ensureExtension(filenamePattern, frameSource === "tensor"),
                clipNumber: checkResult?.clipId ?? 1,
                startFrame: checkResult?.firstSafeIndex ?? 0,
                outputDir,
            })
            setProgressText("Done")
        } catch (e) {
            console.error("Export failed", e)
            setProgressText("Export failed")
        } finally {
            if (unlisten) unlisten()
            setIsExporting(false)
        }
    }

    // these settings can't be initialized by the storage controller
    // due to the way the storage controller is initialized
    useEffect(() => {
        if (!storage.state.export.framesOutputDir)
            storage.updateSetting("export", "framesOutputDir", defaultOutputDir)
    }, [storage])

    useDebounceEffect(
        () => {
            checkPattern(
                ensureExtension(filenamePattern, frameSource === "tensor"),
                outputDir,
                frameCount ?? 0,
            ).then(setCheckResult)
        },
        [filenamePattern, outputDir, frameCount, frameSource],
        { wait: 500 },
    )

    return (
        <ContentPanelPopup
            shadeElem={rootElement}
            onClose={() => {
                onClose()
            }}
            flexDir={"column"}
            panelProps={{
                height: "auto",
            }}
            height={"auto"}
            shadeProps={{
                bgColor: "#22222266",
            }}
        >
            <VStack
                padding={2}
                flex="1 1 auto"
                alignItems="stretch"
                justifyContent={"flex-start"}
                gap={2}
            >
                <Text paddingX={2} fontSize={"md"} fontWeight={"600"}>
                    Export Frames
                </Text>

                <PanelSection gridTemplateColumns={"1fr"}>
                    {/* <PanelSectionHeader>Output Directory</PanelSectionHeader> */}
                    <VStack alignItems="stretch" gap={1} paddingX={4} paddingY={2}>
                        <HStack alignItems="flex-end">
                            <Field.Root width={"full"}>
                                <Field.Label>Directory</Field.Label>
                                <HStack width={"full"} gap={1}>
                                    <Input
                                        flex={"1 1 auto"}
                                        variant={"subtle"}
                                        value={outputDir}
                                        onChange={(e) => setOutputDir(e.target.value)}
                                    />
                                    <PanelButton
                                        flex={"0 0 auto"}
                                        onClick={async () => {
                                            const dir = await open({
                                                directory: true,
                                                defaultPath: outputDir,
                                                canCreateDirectories: true,
                                                title: "Select output directory",
                                            })
                                            if (dir) {
                                                setOutputDir(dir)
                                            }
                                        }}
                                    >
                                        Browse
                                    </PanelButton>
                                </HStack>
                                {checkResult?.outputDirDne && (
                                    <Field.HelperText color="orange.solid">
                                        Folder doesn't exist - it will be created
                                    </Field.HelperText>
                                )}
                            </Field.Root>
                        </HStack>
                    </VStack>
                    <VStack alignItems="stretch" gap={1} paddingX={4} paddingY={2}>
                        <Field.Root invalid={!!checkResult?.invalidReason} width={"full"}>
                            <Field.Label>
                                Pattern
                                <Tooltip tip={<PatternInfo />} contentProps={{ maxWidth: "30rem" }}>
                                    <PiInfo size={16} />
                                </Tooltip>
                            </Field.Label>
                            <HStack width={"full"} gap={1}>
                                <Input
                                    flex={"1 1 auto"}
                                    variant={"subtle"}
                                    value={filenamePattern}
                                    onChange={(e) => setFilenamePattern(e.target.value)}
                                />
                                <PanelButton
                                    flex={"0 0 auto"}
                                    onClick={() => setFilenamePattern("clip_%%%_frame_###")}
                                >
                                    Reset
                                </PanelButton>
                            </HStack>
                            <Field.ErrorText>{checkResult?.invalidReason}</Field.ErrorText>
                        </Field.Root>

                        <Text>Preview:</Text>
                        <Text>{checkResult?.examples?.join(", ")?.replace("., ", ".")}</Text>
                        {/* {checkResult?.examples.map((f) => (
                            <Text key={f}>{f}</Text>
                        ))} */}
                    </VStack>
                </PanelSection>

                <PanelSection>
                    <PanelSectionHeader>Frame Source</PanelSectionHeader>
                    <VStack alignItems="stretch" gap={1} paddingX={4} paddingY={2}>
                        <HStack gap={2} padding={0}>
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
                        </Text>
                        <Text fontSize="sm" color="fg.1">
                            {frameSource === "preview"
                                ? "Fast - uses the high quality, preview image for each frame. Generated files will be .png (This uses the same images as the video preview)."
                                : "Slow, best quality, uses original generated tensor output. Generated files will be .jpg"}
                        </Text>
                        {scaleFactor && scaleFactor > 1 && (
                            <Text fontSize="sm" color="fg.1">
                                Note: Upscaled videos must use the Tensor source for full
                                resolution.
                            </Text>
                        )}
                    </VStack>
                </PanelSection>

                {isExporting || progressText === "Done" || progressText === "Export failed" ? (
                    <ExportProgress
                        finished={finishedFrames}
                        total={totalFrames}
                        progressText={progressText}
                    />
                ) : null}
                <HStack justifyContent="flex-end" gap={2} marginTop={2}>
                    <Button variant="outline" onClick={onClose} disabled={isExporting}>
                        {progressText === "Done" ? "Close" : "Cancel"}
                    </Button>
                    <PanelButton
                        onClick={handleExport}
                        disabled={!checkResult?.valid || isExporting}
                    >
                        Export
                    </PanelButton>
                </HStack>
            </VStack>
        </ContentPanelPopup>
    )
}

function PatternInfo() {
    return (
        <VStack alignItems={"stretch"} maxWidth={"40rem"} gap={4}>
            <VStack alignItems="stretch" gap={2}>
                <Text fontWeight="bold">Tokens</Text>
                <Grid gridTemplateColumns={"auto 1fr"} gapX={4} gapY={2} alignItems="baseline">
                    <Text fontFamily="monospace" fontWeight="bold" color="accent.1">
                        ###
                    </Text>
                    <VStack alignItems="start" gap={0}>
                        <Text fontWeight="semibold">Frame counter</Text>
                        <Text fontSize="sm" color="fg.1">
                            Replaced with frame number. # count determines padding (e.g. ### → 001).
                        </Text>
                    </VStack>

                    <Text fontFamily="monospace" fontWeight="bold" color="accent.1">
                        %%%
                    </Text>
                    <VStack alignItems="start" gap={0}>
                        <Text fontWeight="semibold">Clip counter</Text>
                        <Text fontSize="sm" color="fg.1">
                            Replaced with clip number. (Optional).
                        </Text>
                    </VStack>
                </Grid>
                <Text fontSize="sm" color="orange.solid" fontWeight="medium">
                    Note: Do not include the file extension (e.g. .png) in the pattern. It will be
                    added automatically.
                </Text>
            </VStack>

            <VStack alignItems="stretch" gap={2}>
                <Text fontWeight="bold">Examples</Text>
                <Grid gridTemplateColumns={"1fr 1fr"} gap={4} alignItems="start">
                    <VStack alignItems="start" gap={1} p={2} bg="bg.1" borderRadius="md">
                        <Text
                            fontSize="xs"
                            fontWeight="bold"
                            textTransform="uppercase"
                            color="fg.1"
                        >
                            Per-clip numbering
                        </Text>
                        <Text fontFamily="monospace" fontSize="sm" color="accent.1">
                            clip_%%_frame_###
                        </Text>
                        <VStack alignItems="start" gap={0} fontSize="sm" color="fg.1" mt={1}>
                            <Text>clip_01_frame_001.jpg</Text>
                            <Text>clip_01_frame_002.jpg</Text>
                            <Text color="fg.2" fontSize="xs" mt={1} mb={0.5}>
                                Second clip:
                            </Text>
                            <Text>clip_02_frame_001.jpg</Text>
                        </VStack>
                        <Text fontSize="xs" color="fg.2" fontStyle="italic">
                            Frame count resets.
                        </Text>
                    </VStack>

                    <VStack alignItems="start" gap={1} p={2} bg="bg.1" borderRadius="md">
                        <Text
                            fontSize="xs"
                            fontWeight="bold"
                            textTransform="uppercase"
                            color="fg.1"
                        >
                            Continuous numbering
                        </Text>
                        <Text fontFamily="monospace" fontSize="sm" color="accent.1">
                            frame_###
                        </Text>
                        <VStack alignItems="start" gap={0} fontSize="sm" color="fg.1" mt={1}>
                            <Text>frame_001.jpg</Text>
                            <Text>frame_002.jpg</Text>
                            <Text color="fg.2" fontSize="xs" mt={1} mb={0.5}>
                                Second clip:
                            </Text>
                            <Text>frame_003.jpg</Text>
                        </VStack>
                        <Text fontSize="xs" color="fg.2" fontStyle="italic">
                            Frame count continues.
                        </Text>
                    </VStack>
                </Grid>
            </VStack>
        </VStack>
    )
}

function ensureExtension(filenamePattern: string, useTensor: boolean) {
    const extension = useTensor ? ".png" : ".jpg"
    // Remove existing extension if present
    const base = filenamePattern.replace(/\.[a-z0-9]+$/i, "")
    return base + extension
}
