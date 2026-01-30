import { Box } from "@chakra-ui/react"
import { invoke } from "@tauri-apps/api/core"
import { save } from "@tauri-apps/plugin-dialog"
import * as fs from "@tauri-apps/plugin-fs"
import { type ComponentProps, useRef, useState } from "react"
import { FiCopy, FiSave } from "react-icons/fi"
import { PiListMagnifyingGlassBold } from "react-icons/pi"
import type { Snapshot } from "valtio"
import { dtProject, pdb } from "@/commands"
import { IconButton } from "@/components"
import FrameCountIndicator from "@/components/FrameCountIndicator"
import VideoFrameIcon from "@/components/icons/VideoFramesIcon"
import type { VideoContextType } from "@/components/video/context"
import type { ImageExtra } from "@/generated/types"
import { sendToMetadata } from "@/metadata/state/interop"
import { useDTP } from "../state/context"
import type { ProjectState } from "../state/projects"
import type { UIControllerState } from "../state/uiState"
import { FramesExportDialog } from "./clipExport/FramesExportDialog"
import { VideoExportDialog } from "./clipExport/VideoExportDialog"
import { DetailsButtonBarRoot } from "./common"

interface DetailsButtonBarProps
    extends Omit<
        ComponentProps<typeof DetailsButtonBarRoot>,
        "transition" | "color" | "translate"
    > {
    item?: ImageExtra
    tensorId?: string
    show?: boolean
    addMetadata?: boolean
    subItem?: Snapshot<UIControllerState["detailsView"]["subItem"]>
    project?: ProjectState
    videoRef?: React.RefObject<VideoContextType | null>
    isVideo?: boolean
}
function DetailsButtonBar(props: DetailsButtonBarProps) {
    const { item, tensorId, show, addMetadata, subItem, project, videoRef, isVideo, ...restProps } =
        props
    const { uiState } = useDTP()
    const [lockButtons, setLockButtons] = useState(false)
    const [showExportDialog, setShowExportDialog] = useState(false)
    const [showFramesDialog, setShowFramesDialog] = useState(false)

    const projectId = item?.project_id
    const nodeId = addMetadata ? item?.node_id : undefined

    const detailsOverlay = useRef(document.getElementById("details-overlay") as HTMLDivElement)

    const getFrame = async (frameIndex?: number) => {
        if (!item) return
        if (frameIndex === undefined) {
            frameIndex = videoRef?.current?.controls?.frameMv?.get() ?? 0
        }
        console.log("getting frame", frameIndex)

        const clip = await pdb.getClip(item.id)
        const frame = clip[frameIndex]
        if (!frame) return

        return await dtProject.decodeTensor(item.project_id, frame.tensor_id, true, frame.row_id)
    }

    const getImage = async (frameIndex?: number) => {
        if (isVideo) return getFrame(frameIndex)
        console.log("getting image")
        if (!project?.path || !tensorId) return
        return await dtProject.decodeTensor(project.path, tensorId, true, nodeId)
    }

    const disabled = !projectId || !tensorId || !show || lockButtons

    return (
        <DetailsButtonBarRoot
            data-solid
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0 }}
            animate={{ opacity: show ? 1 : 0 }}
            transition={{ duration: 0.2 }}
            pointerEvents="auto"
            {...restProps}
        >
            {subItem?.maskUrl && (
                <IconButton
                    size={"sm"}
                    disabled={disabled}
                    onClick={() => uiState.toggleSubItemMask()}
                >
                    <FiCopy />
                </IconButton>
            )}

            <IconButton
                size={"sm"}
                disabled={disabled}
                onClick={() => {
                    setLockButtons(true)
                    uiState
                        .callWithSpinner(async () => {
                            const imgData = await getImage()
                            if (!imgData) return
                            await invoke("write_clipboard_binary", {
                                ty: `public.png`,
                                data: imgData,
                            })
                        })
                        .finally(() => setLockButtons(false))
                }}
                tip={isVideo ? "Copy selected frame" : "Copy image"}
            >
                <FiCopy />
            </IconButton>
            <IconButton
                size={"sm"}
                disabled={disabled}
                onClick={() => {
                    setLockButtons(true)
                    uiState
                        .callWithSpinner(async () => {
                            const imgData = await getImage()
                            if (!imgData) return
                            const savePath = await save({
                                canCreateDirectories: true,
                                title: "Save image",
                                filters: [{ name: "Image", extensions: ["png"] }],
                            })
                            if (savePath) {
                                await fs.writeFile(savePath, imgData)
                            }
                        })
                        .finally(() => setLockButtons(false))
                }}
                tip={isVideo ? "Save selected frame" : "Save image"}
            >
                <FiSave />
            </IconButton>
            <IconButton
                size={"sm"}
                disabled={disabled}
                onClick={() => {
                    setLockButtons(true)
                    uiState
                        .callWithSpinner(async () => {
                            const imgData = await getImage()
                            if (!imgData) return
                            await sendToMetadata(imgData, "png", {
                                source: "project",
                                projectFile: project?.path,
                                tensorId,
                                nodeId,
                            })
                        })
                        .finally(() => setLockButtons(false))
                }}
                tip={isVideo ? "Send frame to Metadata Viewer" : "Open in Metadata Viewer"}
            >
                <PiListMagnifyingGlassBold />
            </IconButton>
            {isVideo && (
                <>
                    <Box height={8} width={"1px"} bgColor={"gray/50"} marginInline={1} />
                    <IconButton
                        size={"sm"}
                        onClick={() => {
                            if (!item) return
                            setShowExportDialog(true)
                        }}
                        tip="Save video"
                    >
                        <FrameCountIndicator thickness={20} bgColor={"transparent"} count={"▶︎"} />
                    </IconButton>
                    {showExportDialog && item && (
                        <VideoExportDialog
                            rootElement={detailsOverlay}
                            onClose={() => setShowExportDialog(false)}
                            image={item}
                        />
                    )}
                    <IconButton
                        size={"sm"}
                        onClick={async () => {
                            if (!item) return
                            setShowFramesDialog(true)
                        }}
                        tip="Save all frames"
                    >
                        <VideoFrameIcon />
                    </IconButton>
                    {showFramesDialog && item && (
                        <FramesExportDialog
                            rootElement={detailsOverlay}
                            onClose={() => setShowFramesDialog(false)}
                            image={item}
                        />
                    )}
                </>
            )}
        </DetailsButtonBarRoot>
    )
}

export default DetailsButtonBar
