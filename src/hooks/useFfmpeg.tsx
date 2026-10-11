import { Box, FormatByte, Grid } from "@chakra-ui/react"
import { listen } from "@tauri-apps/api/event"
import { platform } from "@tauri-apps/plugin-os"
import { memo, useEffect } from "react"
import { ffmpegCheck, ffmpegDownload } from "@/commands"
import { PanelButton, PanelSection, Progress } from "@/components"
import { useProxyRef } from "./valtioHooks"

type FfmpegStatus = "unknown" | "not-installed" | "installed" | "installing" | "error"
type FfmpegProgress = {
    progress: number
    total: number
    received: number
    msg: string
    state: string
}

type FfmpegComponentProps = ChakraProps & {
    linuxMessage: string
    macMessage: string
}

export function useFfmpeg(hideOnComplete = false, onComplete?: () => void) {
    const usesSystemFfmpeg = platform() === "linux"
    const { state, snap } = useProxyRef(() => ({
        showComponent: false,
        status: "unknown" as FfmpegStatus,
        progressText: "",
        progress: 0,
        total: 0,
        received: 0,
    }))

    useEffect(() => {
        ffmpegCheck()
            .then((result) => {
                state.status = result ? "installed" : "not-installed"
                if (!result) state.showComponent = true
            })
            .catch((error) => {
                state.status = "error"
                state.progressText = String(error)
                state.showComponent = true
            })
    }, [state])

    const installFfmpeg = async () => {
        const unlisten = await listen<FfmpegProgress>("ffmpeg_download_progress", (event) => {
            const msg = event.payload.msg
            if (event.payload.state === "downloading") {
                state.progress = event.payload.progress
                state.total = event.payload.total
                state.received = event.payload.received
            }
            if (event.payload.state === "done") {
                state.progress = 1
                state.received = state.total
                if (hideOnComplete) state.showComponent = false
            }
            state.progressText = msg
        })
        state.status = "installing"
        try {
            state.progressText = usesSystemFfmpeg ? "Checking system tools..." : "Downloading..."
            await ffmpegDownload()
            state.status = "installed"
            onComplete?.()
        } catch (e) {
            state.status = "error"
            state.progressText = `Something went wrong: ${e}`
        } finally {
            unlisten()
        }
    }

    const FfmpegComponent = memo((props: FfmpegComponentProps) => {
        const { linuxMessage, macMessage, ...restProps } = props
        if (!snap.showComponent) return null
        return (
            <PanelSection data-testid="ffmpeg-section" {...restProps}>
                <Grid
                    padding={4}
                    gridTemplateColumns={"auto auto"}
                    gridTemplateRows={"auto auto"}
                    alignItems={"center"}
                    justifyContent={"center"}
                    gap={4}
                >
                    <Box>{usesSystemFfmpeg ? linuxMessage : macMessage}</Box>
                    <PanelButton
                        onClick={() => {
                            installFfmpeg()
                        }}
                        disabled={snap.status === "installing" || snap.status === "installed"}
                    >
                        {
                            {
                                "not-installed": usesSystemFfmpeg ? "Check again" : "Install",
                                installing: usesSystemFfmpeg ? "Checking..." : "Installing...",
                                installed: "Done!",
                                error: "Retry",
                                unknown: usesSystemFfmpeg ? "Check" : "Install",
                            }[snap.status]
                        }
                    </PanelButton>
                    {snap.status === "error" && (
                        <Box gridColumn="span 2" color="fg.error">
                            {snap.progressText}
                        </Box>
                    )}
                    {snap.total > 0 && (
                        //
                        <Progress
                            gridColumn={"span 2"}
                            valueText={snap.progressText}
                            labelA={<FormatByte value={snap.received} />}
                            labelB={<FormatByte value={snap.total} />}
                            showValueText={true}
                            value={snap.progress * 100}
                        />
                    )}
                </Grid>
            </PanelSection>
        )
    })

    return { status: snap.status, isReady: snap.status === "installed", FfmpegComponent }
}
