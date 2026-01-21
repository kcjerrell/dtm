import { chakra, HStack } from "@chakra-ui/react"
import { invoke } from "@tauri-apps/api/core"
import { save } from "@tauri-apps/plugin-dialog"
import * as fs from "@tauri-apps/plugin-fs"
import { AnimatePresence, motion } from "motion/react"
import { type ComponentProps, useMemo, useRef, useState } from "react"
import type { Snapshot } from "valtio"
import { dtProject, type ImageExtra } from "@/commands"
import { IconButton } from "@/components"
import { FiCopy, FiSave, PiListMagnifyingGlassBold } from "@/components/icons"
import type { VideoContextType } from "@/components/video/context"
import { Hotkey } from "@/hooks/keyboard"
import { sendToMetadata } from "@/metadata/state/interop"
import { useDTP } from "../state/context"
import type { ProjectState } from "../state/projects"
import type { UIControllerState } from "../state/uiState"
import DetailsContent from "./DetailsContent"
import DetailsImages from "./DetailsImages"
import { DTImageProvider } from "./DTImageProvider"
import TensorsList from "./TensorsList"

const transition = { duration: 0.25, ease: "easeInOut" }

interface DetailsOverlayProps extends ComponentProps<typeof Container> {}

function DetailsOverlay(props: DetailsOverlayProps) {
    const { ...rest } = props

    const { uiState, images } = useDTP()
    const snap = uiState.useDetailsOverlay()

    const videoRef = useRef<VideoContextType>(null)
    const isVideo = !!snap.item?.num_frames

    const { item, itemDetails } = snap

    const isVisible = !!item
    const showSpinner = !!(snap.showSpinner || snap.subItem?.isLoading)

    const hotkeys = useMemo(
        () => ({
            escape: () => {
                if (uiState.state.detailsView.subItem) {
                    uiState.hideSubItem()
                } else {
                    uiState.hideDetailsOverlay()
                }
            },
            left: () => {
                images.selectPrevItem()
            },
            right: () => {
                images.selectNextItem()
            },
        }),
        [uiState, images],
    )

    return (
        <DTImageProvider image={snap.itemDetails}>
            <Container
                pointerEvents={isVisible ? "auto" : "none"}
                onClick={() => {
                    if (snap.subItem) uiState.hideSubItem()
                    else uiState.hideDetailsOverlay()
                }}
                variants={{
                    open: {
                        backgroundColor: "#00000099",
                        backdropFilter: "blur(5px)",
                        visibility: "visible",
                        transition: {
                            visibility: {
                                duration: 0,
                                delay: 0,
                            },
                            duration: transition.duration,
                            ease: "easeInOut",
                        },
                    },
                    closed: {
                        backgroundColor: "#00000000",
                        backdropFilter: "blur(0px)",
                        visibility: "hidden",
                        transition: {
                            visibility: {
                                duration: 0,
                                delay: transition.duration,
                            },
                            duration: transition.duration,
                            ease: "easeInOut",
                        },
                    },
                }}
                initial={"closed"}
                exit={"closed"}
                animate={isVisible ? "open" : "closed"}
                transition={{ duration: transition.duration }}
                {...rest}
            >
                {isVisible && <Hotkey scope="details-overlay" handlers={hotkeys} />}
                <AnimatePresence mode={"sync"}>
                    {item && (
                        <DetailsImages
                            key={item.id}
                            item={item}
                            videoRef={videoRef}
                            itemDetails={itemDetails}
                            subItem={snap.subItem}
                            showSpinner={showSpinner}
                        />
                    )}
                    <DetailsButtonBar
                        key={"details_button_bar"}
                        transform={snap.subItem ? "translateY(-2rem)" : "unset"}
                        marginY={-3}
                        zIndex={5}
                        alignSelf={"center"}
                        justifySelf={"center"}
                        gridArea={"commandBar"}
                        item={item}
                        project={snap.project}
                        show={true}
                        subItem={snap.subItem}
                        addMetadata={!snap.subItem}
                        tensorId={snap.subItem?.tensorId ?? itemDetails?.images?.tensorId}
                        videoRef={videoRef}
                        isVideo={isVideo}
                    />
                    <TensorsList
                        key={"tensors_list"}
                        gridArea={"tensors"}
                        zIndex={1}
                        item={item}
                        details={itemDetails}
                        candidates={snap.candidates}
                        transition={{ duration: transition.duration }}
                    />
                </AnimatePresence>
                {isVisible && (
                    <DetailsContent
                        gridArea={"content"}
                        height={"100%"}
                        overflow={"clip"}
                        zIndex={2}
                        item={item}
                        details={itemDetails}
                    />
                )}
            </Container>
        </DTImageProvider>
    )
}

const Container = chakra(
    motion.div,
    {
        base: {
            position: "absolute",
            display: "grid",
            gridTemplateColumns: "1fr max(18rem, min(40%, 30rem))",
            gridTemplateRows: "1fr auto auto",
            gridTemplateAreas: '"image content" "commandBar content" "tensors content"',
            width: "100%",
            height: "100%",
            gap: 6,
            padding: 6,
            justifyContent: "stretch",
            alignItems: "center",
            // inset: 0,
            // overflow: "clip",
            // zIndex: "5",
        },
    },
    { forwardProps: ["transition"] },
)

interface DetailsButtonBarProps extends ChakraProps {
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
    const { item, tensorId, show, addMetadata, subItem, project, videoRef, isVideo, ...restProps } = props
    const { uiState } = useDTP()
    const [lockButtons, setLockButtons] = useState(false)

    const projectId = item?.project_id
    const nodeId = addMetadata ? item?.node_id : undefined

    const getImage = async () => {
        if (!project?.path || !tensorId) return
        return await dtProject.decodeTensor(project.path, tensorId, true, nodeId)
    }

    const disabled = !projectId || !tensorId || !show || lockButtons
    return (
        <HStack
            alignSelf={"center"}
            margin={2}
            zIndex={1}
            bgColor={"bg.2"}
            justifyContent={"center"}
            borderRadius={"lg"}
            paddingX={2}
            boxShadow={"pane1"}
            border={"1px solid {colors.gray.500/50}"}
            onClick={(e) => e.stopPropagation()}
            asChild
            {...restProps}
        >
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: show ? 1 : 0 }}
                // exit={{ opacity: 0, transition: { delay: 0, duration: 0.5 } }}
                transition={{ duration: 0.2, delay: 0.2 }}
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
                    tip="Copy image"
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
                    tip="Save image"
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
                    tip="Open in Metadata Viewer"
                >
                    <PiListMagnifyingGlassBold />
                </IconButton>
                <IconButton
                    size={"sm"}
                    onClick={() => {
                        console.log(videoRef?.current?.controls?.frameMv?.get())
                    }}
                    tip="Get frame"
                >
                    <FiCopy />
                </IconButton>
            </motion.div>
        </HStack>
    )
}

export default DetailsOverlay
