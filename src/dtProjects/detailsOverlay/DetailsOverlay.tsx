import { AnimatePresence } from "motion/react"
import { type ComponentProps, useMemo, useRef } from "react"
import type { VideoContextType } from "@/components/video/context"
import { Hotkey } from "@/hooks/keyboard"
import { useDTP } from "../state/context"
import { DetailsOverlayContainer } from "./common"
import DetailsButtonBar from "./DetailsButtonBar"
import DetailsContent from "./DetailsContent"
import DetailsImages from "./DetailsImages"
import { DTImageProvider } from "./DTImageProvider"
import TensorsList from "./TensorsList"

const transition = { duration: 0.25, ease: "easeInOut" }

interface DetailsOverlayProps extends ComponentProps<typeof DetailsOverlayContainer> {}

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
            <DetailsOverlayContainer
                id={"details-overlay"}
                pointerEvents={isVisible ? "auto" : "none"}
                // onClick={() => {
                //     if (snap.subItem) uiState.hideSubItem()
                //     else uiState.hideDetailsOverlay()
                // }}
                onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => {
                    if (!e.target.closest("[data-solid]")) {
                        if (snap.subItem) uiState.hideSubItem()
                        else uiState.hideDetailsOverlay()
                    }
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
                        data-solid
                        key={"details_button_bar"}
                        transform={snap.subItem ? "translateY(-2rem)" : "unset"}
                        marginY={-3}
                        zIndex={5}
                        alignSelf={"center"}
                        justifySelf={"center"}
                        gridArea={"commandBar"}
                        item={item}
                        project={snap.project}
                        show={isVisible}
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
                        data-solid
                        gridArea={"content"}
                        height={"100%"}
                        overflow={"clip"}
                        zIndex={2}
                        item={item}
                        details={itemDetails}
                    />
                )}
            </DetailsOverlayContainer>
        </DTImageProvider>
    )
}

export default DetailsOverlay
