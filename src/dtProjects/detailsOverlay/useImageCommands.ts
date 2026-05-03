import { invoke } from "@tauri-apps/api/core"
import * as fs from "@tauri-apps/plugin-fs"
import { useCallback, useMemo } from "react"
import { FiCopy, FiSave } from "react-icons/fi"
import { PiListMagnifyingGlassBold } from "react-icons/pi"
import { RiFileSettingsLine } from "react-icons/ri"
import FrameCountIndicator from "@/components/FrameCountIndicator"
import { DottedOutlineIcon, PoseIcon } from "@/components/icons/icons"
import VideoFrameIcon from "@/components/icons/VideoFramesIcon"
import type { VideoContextType } from "@/components/video/context"
import { sendToMetadata } from "@/metadata/state/interop"
import type { ICommand } from "@/types"
import { writeClipboardText } from "@/utils/clipboard"
import { showMenu } from "@/utils/menu"
import { save } from "@/utils/tauri"
import { useDTP } from "../state/context"
import type { ResourceHandle } from "../util/resourceHandle"

export interface ImageCommandContext {
    isContextMenu?: boolean
    videoRef?: React.RefObject<VideoContextType | null>
}

/*
    image commands:
        Copy (first/selected) image/frame   -   (menu/toolbar) image/video
        Save (first/selected) image/frame   -   (menu/toolbar) image/video
        Send (first/selected frame) to Metadata viewer  -  (menu/toolbar)
        Copy config
        Copy prompt (menu)
        Export video
        Export frames
        Select project
*/

export function useImageCommands(): [
    (
        selected: ResourceHandle[],
        context: ImageCommandContext,
    ) => Promise<(() => void | Promise<void>) | null>,
    ICommand<ResourceHandle, ImageCommandContext>[],
] {
    const { uiState, projects, details } = useDTP()

    const commands: ICommand<ResourceHandle, ImageCommandContext>[] = useMemo(
        () => [
            {
                id: "copyImage",
                getLabel: (selected, ctx) => {
                    if (!selected[0].isVideo) return "Copy image"
                    return `Copy ${ctx?.isContextMenu ? "first" : "selected"} frame`
                },
                getTip: (selected, _) =>
                    selected[0].isVideo ? "Copy selected frame" : "Copy image",
                icon: FiCopy,
                action: async (selected, ctx) => {
                    let frame: number | undefined
                    if (ctx?.videoRef?.current) {
                        ctx.videoRef?.current.controls.pause()
                        frame = ctx.videoRef.current.controls.getFrame()
                    }
                    const data = await selected[0].getPngData(frame)
                    if (!data) return
                    await invoke("write_clipboard_binary", {
                        ty: `public.png`,
                        data,
                    })
                },
            },
            {
                id: "copyPose",
                getLabel: () => "Copy pose",
                getTip: () => "Copy pose data as JSON",
                toolbarOnly: true,
                toolbarEnableMode: "hide",
                icon: PoseIcon,
                getEnabled: (selected) => !!selected?.[0].isPose,
                action: async (selected, _) => {
                    if (!selected[0].isPose) return
                    const pose = await selected[0].getPoseData()
                    if (!pose) return
                    navigator.clipboard.writeText(JSON.stringify(pose))
                },
            },
            {
                id: "saveImage",
                getLabel: (selected, ctx) => {
                    if (!selected[0].isVideo) return "Save image"
                    return ctx?.isContextMenu ? "Save first frame" : "Save selected frame"
                },
                getTip: (selected, _) =>
                    selected[0].isVideo ? "Save selected frame" : "Save image",
                icon: FiSave,
                action: async (selected, ctx) => {
                    let frame: number | undefined
                    if (ctx?.videoRef?.current) {
                        ctx.videoRef?.current.controls.pause()
                        frame = ctx.videoRef.current.controls.getFrame()
                    }
                    const data = await selected[0].getPngData(frame)
                    if (!data) return
                    const savePath = await save({
                        canCreateDirectories: true,
                        title: "Save image",
                        filters: [{ name: "Image", extensions: ["png"] }],
                    })
                    if (savePath) {
                        await fs.writeFile(savePath, data)
                    }
                },
            },
            {
                id: "copyConfig",
                label: "Copy config",
                tip: "Copy config",
                icon: RiFileSettingsLine,
                getEnabled: (selected) => !!selected?.[0].image,
                toolbarEnableMode: "hide",
                menuEnableMode: "hide",
                action: async (selected) => {
                    const image = selected[0].image
                    if (!image) return
                    const imageFull = await details.getDetails(image)
                    if (!imageFull) return
                    // await navigator.clipboard.writeText(JSON.stringify(imageFull.config, null, 2))
                    await writeClipboardText(imageFull.config)
                },
                requiresSelection: true,
            },
            {
                id: "sendToMetadata",
                getLabel: (selected, ctx) => {
                    if (!selected[0].isVideo) return "Send to Metadata"
                    return ctx?.isContextMenu
                        ? "Send first frame to Metadata"
                        : "Send selected frame to Metadata"
                },
                getTip: (selected, _) =>
                    selected[0].isVideo
                        ? "Send selected frame to Metadata"
                        : "Send image to Metadata",
                icon: PiListMagnifyingGlassBold,
                action: async (selected, ctx) => {
                    let frame: number | undefined
                    if (ctx?.videoRef?.current) {
                        ctx.videoRef?.current.controls.pause()
                        frame = ctx.videoRef.current.controls.getFrame()
                    }
                    console.log("here")
                    const data = await selected[0].getPngData(frame)
                    if (!data) return
                    const project = projects.getProject(selected[0].projectId)
                    await sendToMetadata(data, "png", {
                        source: "project",
                        projectFile: project?.path,
                        tensorId: await selected[0].getTensorId(),
                        nodeId: selected[0].nodeId,
                    })
                },
            },
            {
                id: "toggleCanvasOutlines",
                getLabel: () => {
                    if (uiState.state.detailsView.showCanvasOutlines) return "Hide canvas outlines"
                    return "Show canvas outlines"
                },
                icon: DottedOutlineIcon,
                getEnabled: (selected) => !!selected?.[0]?.isCanvasStack,
                toolbarEnableMode: "hide",
                noSpinner: true,
                action: () => {
                    uiState.toggleCanvasOutlines()
                },
            },
            { id: "separator-1", separator: true },
            {
                id: "saveVideo",
                label: "Save video",
                getTip: () => "Save video",
                icon: FrameCountIndicator,
                getEnabled: (selected) => !!selected?.[0].isVideo,
                toolbarEnableMode: "hide",
                menuEnableMode: "hide",
                action: (selected, _) => {
                    if (!selected[0].image) return
                    uiState.showDialog({
                        dialogType: "clip-export-video",
                        props: { image: selected[0].image },
                    })
                },
                ellipses: true,
            },
            {
                id: "saveFrames",
                label: "Save all frames",
                getTip: () => "Save all frames",
                icon: VideoFrameIcon,
                getEnabled: (selected) => !!selected?.[0].isVideo,
                toolbarEnableMode: "hide",
                menuEnableMode: "hide",
                action: async (selected, _) => {
                    if (!selected[0].image) return
                    uiState.showDialog({
                        dialogType: "clip-export-frames",
                        props: { image: selected[0].image },
                    })
                },
                ellipses: true,
            },
        ],
        [uiState, projects, details],
    )

    const selectMenuCommand = useCallback(
        async (selected: ResourceHandle[]) => {
            const command = await showMenu(commands, selected, { isContextMenu: true })
            if (!command) return null
            return () => command.action?.(selected, { isContextMenu: true })
        },
        [commands],
    )

    return [selectMenuCommand, commands] as const
}
