import { invoke } from "@tauri-apps/api/core"
import { save } from "@tauri-apps/plugin-dialog"
import * as fs from "@tauri-apps/plugin-fs"
import { useCallback, useMemo } from "react"
import { FiCopy, FiSave } from "react-icons/fi"
import { PiListMagnifyingGlassBold } from "react-icons/pi"
import type { Snapshot } from "valtio"
import { DtpService, type ImageExtra } from "@/commands"
import VideoFrameIcon from "@/components/icons/VideoFramesIcon"
import { sendToMetadata } from "@/metadata/state/interop"
import type { ICommandItem } from "@/types"
import { showMenu } from "@/utils/menu"
import { useDTP } from "../state/context"

export interface ImageCommandContext {
    isContextMenu?: boolean
    // isVideo?: boolean
    // videoRef?: React.RefObject<VideoContextType | null>
    // item?: ImageExtra
    // tensorId?: string
    // addMetadata?: boolean
    // project?: ProjectState
    // subItem?: Snapshot<UIControllerState["detailsView"]["subItem"]>
    // setLockButtons: (lock: boolean) => void
    // setShowExportDialog: (show: boolean) => void
    // setShowFramesDialog: (show: boolean) => void
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

    Dependencies

*/

export function useImageCommands(): [
    (
        selected: ImageExtra[],
        context: ImageCommandContext,
    ) => Promise<(() => void | Promise<void>) | null>,
    ICommandItem<ImageExtra, ImageCommandContext>[],
] {
    const { uiState } = useDTP()

    const commands: ICommandItem<ImageExtra, ImageCommandContext>[] = useMemo(
        () => [
            // {
            //     id: "copyMask",
            //     label: "Copy image mask",
            //     icon: FiCopy,
            //     getEnabled: (_, ctx) => !!ctx?.subItem?.maskUrl && !ctx?.isVideo,
            //     toolbarEnableMode: "hide",
            //     onClick: () => {
            //         uiState.toggleSubItemMask()
            //     },
            // },
            {
                id: "copyImage",
                getLabel: (selected, ctx) => {
                    if (!isVideo(selected)) return "Copy image"
                    return `Copy ${ctx?.isContextMenu ? "first" : "selected"} frame`
                },
                getTip: (selected, _) => (isVideo(selected) ? "Copy selected frame" : "Copy image"),
                icon: FiCopy,
                onClick: async (selected, _) => {
                    const image = await getImageData(selected)
                    if (!image) return
                    await invoke("write_clipboard_binary", {
                        ty: `public.png`,
                        data: image.data,
                    })
                },
            },
            {
                id: "saveImage",
                getLabel: (selected, ctx) => {
                    if (!isVideo(selected)) return "Save image"
                    return ctx?.isContextMenu ? "Save first frame" : "Save selected frame"
                },
                getTip: (selected, _) => (isVideo(selected) ? "Save selected frame" : "Save image"),
                icon: FiSave,
                onClick: async (selected, _) => {
                    const image = await getImageData(selected)
                    if (!image) return
                    const savePath = await save({
                        canCreateDirectories: true,
                        title: "Save image",
                        filters: [{ name: "Image", extensions: ["png"] }],
                    })
                    if (savePath) {
                        await fs.writeFile(savePath, image.data)
                    }
                },
            },
            {
                id: "sendToMetadata",
                getLabel: (selected, ctx) => {
                    if (!isVideo(selected)) return "Send to Metadata"
                    return ctx?.isContextMenu
                        ? "Send first frame to Metadata"
                        : "Send selected frame to Metadata"
                },
                getTip: (selected, _) =>
                    isVideo(selected)
                        ? "Send selected frame to Metadata"
                        : "Send image to Metadata",
                icon: PiListMagnifyingGlassBold,
                onClick: async (selected, _) => {
                    const image = await getImageData(selected)
                    if (!image) return
                    await sendToMetadata(image.data, "png", {
                        source: "project",
                        projectFile: image.history.project_path,
                        tensorId: image.history.tensor_id ?? undefined,
                        nodeId: selected[0].node_id,
                    })
                },
            },
            {
                id: "saveVideo",
                label: "Save video",
                getTip: () => "Save video",
                icon: VideoFrameIcon,
                getEnabled: (selected) => isVideo(selected),
                toolbarEnableMode: "hide",
                onClick: (selected, ctx) => {
                    uiState.state.dialog = {
                        dialogType: "clip-export-video",
                        image: selected[0],
                    }
                },
            },
            // {
            //     id: "saveFrames",
            //     label: "Save all frames",
            //     getTip: () => "Save all frames",
            //     icon: VideoFrameIcon,
            //     getEnabled: (selected, ctx) => !!(selected.length > 0 && ctx?.item && ctx?.isVideo),
            //     toolbarEnableMode: "hide",
            //     onClick: async (_, ctx) => {
            //         if (!ctx?.item) return
            //         ctx.setShowFramesDialog(true)
            //     },
            // },
        ],
        [],
    )

    const selectMenuCommand = useCallback(
        async (selected: ImageExtra[]) => {
            const command = await showMenu(commands, selected, { isContextMenu: true })
            if (!command) return null
            return () => command.onClick(selected, { isContextMenu: true })
        },
        [commands],
    )

    return [selectMenuCommand, commands] as const
}

async function getImageData(selected: ImageExtra[]) {
    const history = await DtpService.getHistoryFull(selected[0].project_id, selected[0].node_id)
    if (!history || !history.tensor_id) return
    const data = await DtpService.decodeTensor(
        selected[0].project_id,
        history.tensor_id,
        true,
        selected[0].node_id,
    )
    return { data, history }
}

function isVideo(selected?: Snapshot<ImageExtra[]>) {
    if (!selected?.length || !selected[0]) return false
    return selected[0].clip_id && selected[0].clip_id > 0
}
