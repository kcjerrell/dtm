import { invoke } from "@tauri-apps/api/core"
import * as fs from "@tauri-apps/plugin-fs"
import { useCallback, useMemo } from "react"
import { FiCopy, FiSave } from "react-icons/fi"
import { PiListMagnifyingGlassBold } from "react-icons/pi"
import { RiFileSettingsLine } from "react-icons/ri"
import { addNewItem, notifyCompareError } from "@/compare/interop"
import FrameCountIndicator from "@/components/FrameCountIndicator"
import { DottedOutlineIcon, PoseIcon } from "@/components/icons/icons"
import VideoFrameIcon from "@/components/icons/VideoFramesIcon"
import { SbsCompare } from "@/components/imageCompare/icons"
import type { VideoContextType } from "@/components/video/context"
import type { ICommand } from "@/types"
import { writeClipboardText } from "@/utils/clipboard"
import { determineType, getUtiFromExtension } from "@/utils/mediaTypes"
import { showMenu } from "@/utils/menu"
import { save } from "@/utils/tauri"
import { useDTP } from "../state/context"
import type { ResourceHandle } from "../util/resourceHandle"

export interface ImageCommandContext {
    isContextMenu?: boolean
    videoRef?: React.RefObject<VideoContextType | null>
}

async function readProjectImage(
    resource: ResourceHandle,
    projectFile: string | undefined,
    ctx?: ImageCommandContext,
) {
    const controls = ctx?.videoRef?.current?.controls
    controls?.pause()
    const { data, tensorId } = await resource.getPngResource(controls?.getFrame())
    if (!data?.length) throw new Error("No image data available")
    const type = determineType(data)
    if (!type) throw new Error("Could not determine type of media")
    return {
        data,
        type,
        source: { source: "project", projectFile, tensorId, nodeId: resource.nodeId },
    }
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
                    const uti = getUtiFromExtension(determineType(data))
                    if (!uti) {
                        console.error("Could not determine type of media", data.slice(0, 10))
                        return
                    }
                    await invoke("write_clipboard_binary", {
                        ty: uti,
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
                    const mediaType = determineType(data)
                    if (!mediaType) {
                        console.error("Could not determine type of media")
                        return
                    }
                    const savePath = await save({
                        canCreateDirectories: true,
                        title: "Save image",
                        filters: [{ name: "Image", extensions: [mediaType] }],
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
                    const config = imageFull?.config
                    if (!config) return
                    // await navigator.clipboard.writeText(JSON.stringify(imageFull.config, null, 2))
                    await writeClipboardText(config)
                },
                requiresSelection: true,
            },
            {
                id: "compareImage",
                getLabel: (selected, ctx) => {
                    if (!selected[0].isVideo) return "Send to Compare"
                    return ctx?.isContextMenu
                        ? "Send first frame to Compare"
                        : "Send frame to Compare"
                },
                getTip: (selected, _) => {
                    selected[0].isVideo
                        ? "Send to Compare for comparison"
                        : "Send selected frame to Compare for comparison"
                },
                icon: SbsCompare,
                action: async (selected, ctx) => {
                    try {
                        const resource = selected[0]
                        const { data, type, source } = await readProjectImage(
                            resource, projects.getProject(resource.projectId)?.path, ctx,
                        )
                        await addNewItem(data, type, source)
                    } catch (error) {
                        notifyCompareError(error)
                    }
                },
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
                    const { sendToMetadata, notifyMetadataError } = await import("@/metadata/state/interop")
                    try {
                        const resource = selected[0]
                        const { data, type, source } = await readProjectImage(
                            resource, projects.getProject(resource.projectId)?.path, ctx,
                        )
                        await sendToMetadata(data, type, source)
                    } catch (error) {
                        notifyMetadataError(error)
                    }
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
                menuEnableMode: "hide",
                noSpinner: true,
                action: () => {
                    uiState.toggleCanvasOutlines()
                },
            },
            {
                id: "showMaskedRegion",
                getLabel: () => {
                    if (uiState.state.detailsView.subItem?.applyMask) return "Show masked region"
                    return "Hide masked region"
                },
                icon: DottedOutlineIcon,
                getEnabled: (selected) => !!selected?.[0]?.hasMask,
                toolbarEnableMode: "hide",
                menuEnableMode: "hide",
                noSpinner: true,
                action: () => {
                    uiState.toggleSubItemMask()
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
                action: async (selected, _) => {
                    if (!selected[0].image) return
                    const node = await selected[0].getHistory()
                    if (!node) return
                    uiState.showDialog({
                        dialogType: "clip-export-video",
                        props: {
                            image: selected[0].image,
                            historyNode: node,
                        },
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
                    const historyNode = await selected[0].getHistory()
                    if (!historyNode) return
                    uiState.showDialog({
                        dialogType: "clip-export-frames",
                        props: { image: selected[0].image, historyNode },
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
