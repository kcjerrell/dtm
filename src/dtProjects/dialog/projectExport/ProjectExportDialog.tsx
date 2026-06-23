import { Field, HStack, Input, Text, VStack } from "@chakra-ui/react"
import { path } from "@tauri-apps/api"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { open } from "@tauri-apps/plugin-dialog"
import { useEffect, useState } from "react"
import { FiX } from "react-icons/fi"
import { DtpService } from "@/commands"
import { IconButton, PanelButton, PanelSection, PanelSectionHeader } from "@/components"
import { useSetting } from "@/state/settings"
import { plural } from "@/utils/helpers"
import ExportProgress from "../clipExport/ExportProgress"
import type { DialogProps, ProjectExportDialogState } from "../types"

type ExportSource = "preview" | "tensor"

async function getDefaultOutputDir() {
    return await path.documentDir()
}

function ProjectExportDialog(props: DialogProps<ProjectExportDialogState>) {
    const { onClose, projectIds, ...restProps } = props

    const [outputDirSetting, setOutputDirSetting] = useSetting("projectExport.outputDir")
    const [sourceSetting, setSourceSetting] = useSetting("projectExport.source")

    const [outputDir, setOutputDir] = useState(outputDirSetting)
    const [source, setSource] = useState<ExportSource>(sourceSetting as ExportSource)

    const [isExporting, setIsExporting] = useState(false)
    const [finished, setFinished] = useState(0)
    const [total, setTotal] = useState(0)
    const [progressText, setProgressText] = useState("")

    // the output dir setting can't always be initialized by the storage controller
    useEffect(() => {
        if (!outputDirSetting) {
            getDefaultOutputDir().then((dir) => setOutputDirSetting(dir))
        }
    }, [outputDirSetting, setOutputDirSetting])

    const handleExport = async () => {
        if (!outputDir) return
        setIsExporting(true)
        setFinished(0)
        setTotal(0)
        setProgressText("Initializing...")

        let unlisten: UnlistenFn | undefined
        try {
            unlisten = await listen<{ current: number; total: number; msg: string }>(
                "export_projects_progress",
                (event) => {
                    setFinished(event.payload.current)
                    setTotal(event.payload.total)
                    setProgressText(event.payload.msg)
                },
            )

            await DtpService.exportProjects(projectIds, {
                outputFolder: outputDir,
                useTensor: source === "tensor",
            })
            setProgressText("Done")

            setOutputDirSetting(outputDir)
            setSourceSetting(source)
        } catch (e) {
            console.error("Export failed", e)
            setProgressText("Export failed")
        } finally {
            if (unlisten) unlisten()
            setIsExporting(false)
        }
    }

    return (
        <VStack alignItems={"stretch"} gap={2} justifyContent={"flex-start"} {...restProps}>
            <HStack width={"100%"} justifyContent={"space-between"}>
                <Text paddingX={2} color={"fg.1"} fontSize={"md"} fontWeight={"600"}>
                    Export {projectIds.length} {plural(projectIds.length, "project")}
                </Text>
                <IconButton
                    role={"button"}
                    aria-label={"close export dialog"}
                    flex={"0 0 auto"}
                    size="min"
                    onClick={() => onClose()}
                >
                    <FiX />
                </IconButton>
            </HStack>

            <PanelSection variant={"dialog"} gridTemplateColumns={"1fr"}>
                <VStack alignItems="stretch" gap={1} paddingX={4} paddingY={2}>
                    <Field.Root width={"full"}>
                        <Field.Label>Output folder</Field.Label>
                        <HStack width={"full"} gap={1}>
                            <Input
                                data-defctx={true}
                                layerStyle={"borderA"}
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
                                        title: "Select output folder",
                                    })
                                    if (dir) {
                                        setOutputDir(dir)
                                    }
                                }}
                            >
                                Browse
                            </PanelButton>
                        </HStack>
                        {!outputDir && (
                            <Field.HelperText color="orange.solid">
                                Select an output folder
                            </Field.HelperText>
                        )}
                    </Field.Root>
                </VStack>
            </PanelSection>

            <PanelSection variant={"dialog"} asChild>
                <VStack paddingX={4} paddingY={2} gap={1} alignItems={"stretch"}>
                    <PanelSectionHeader>Image Source</PanelSectionHeader>
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
                                tone={source === "preview" ? "selected" : "none"}
                                onClick={() => setSource("preview")}
                                borderRadius="md"
                                borderRightRadius={0}
                            >
                                Preview
                            </PanelButton>
                            <PanelButton
                                flex={1}
                                size="sm"
                                tone={source === "tensor" ? "selected" : "none"}
                                onClick={() => setSource("tensor")}
                                borderRadius="md"
                                borderLeftRadius={0}
                            >
                                Tensor
                            </PanelButton>
                        </HStack>
                        <Text fontSize="sm" color="fg.1">
                            {source === "preview"
                                ? "Fast - uses the high quality preview image for each generation. Exported files are .jpg with Draw Things metadata embedded."
                                : "Slow, best quality - decodes the original generated tensor output. Exported files will be full resolution .png."}
                        </Text>
                        <Text fontSize="sm" color="fg.1">
                            One .zip archive is created per project in the output folder.
                        </Text>
                    </VStack>
                </VStack>
            </PanelSection>

            {isExporting || progressText === "Done" || progressText === "Export failed" ? (
                <ExportProgress finished={finished} total={total} progressText={progressText} />
            ) : null}
            <HStack justifyContent="flex-end" gap={2} marginTop={2}>
                <PanelButton
                    onClick={handleExport}
                    disabled={!outputDir || isExporting || projectIds.length === 0}
                >
                    Export
                </PanelButton>
            </HStack>
        </VStack>
    )
}

export default ProjectExportDialog
