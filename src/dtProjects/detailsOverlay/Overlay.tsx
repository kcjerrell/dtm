import { Spinner } from "@chakra-ui/react"
import { type ComponentProps, useMemo, useRef } from "react"
import type { VideoContextType } from "@/components/video/context"
import { Hotkey } from "@/hooks/keyboard"
import { useDTP } from "../state/context"
import { DetailsOverlayContainer, DetailsSpinnerRoot } from "./common"
import DetailsButtonBar from "./DetailsButtonBar"
import DetailsContent from "./DetailsContent"
import { DTImageProvider } from "./DTImageProvider"
import ItemWrapper from "./ItemWrapper"
import SubItemWrapper from "./SubItemWrapper"
import TensorsList from "./TensorsList"

const transition = { duration: 0.25, ease: "easeInOut" }

interface DetailsOverlayProps extends ComponentProps<typeof DetailsOverlayContainer> {}

function Overlay(props: DetailsOverlayProps) {
    const { ...rest } = props

    const { uiState, images } = useDTP()
    const snap = uiState.useDetailsOverlay()
    const { item, itemDetails } = snap

    const isVisible = !!item
    const showSpinner = !!(snap.showSpinner || snap.subItem?.isLoading)

    // using a ref so the imagecommands (for video) can access the video context
    const videoContextRef = useRef<VideoContextType>(null)
    const isVideo = !!item?.num_frames

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
                role={"dialog"}
                aria-modal
                pointerEvents={isVisible ? "auto" : "none"}
                // data-solid tag is used on components that should not be clicked to close
                // anything else will close the overlay
                onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => {
                    const target = e.target
                    if (!(target instanceof Element) || !target.closest("[data-solid]")) {
                        if (snap.subItem) uiState.hideSubItem()
                        else uiState.hideDetailsOverlay()
                    }
                }}
                expandImage={snap.minimizeContent}
                hidden={!isVisible}
                {...rest}
            >
                {isVisible && <Hotkey scope="details-overlay" handlers={hotkeys} />}
                {item && (
                    <ItemWrapper
                        item={item}
                        itemDetails={itemDetails}
                        subItem={snap.subItem}
                        showSpinner={showSpinner}
                        videoRef={videoContextRef}
                    />
                )}
                {(showSpinner || snap.subItem?.isLoading) && (
                    <DetailsSpinnerRoot key={"subitem_spinner"} gridArea={"image"}>
                        <Spinner width={"100%"} height={"100%"} color={"white"} />
                    </DetailsSpinnerRoot>
                )}
                {snap.subItem && (
                    <SubItemWrapper
                        subItem={snap.subItem}
                        padding={8}
                        paddingTop={2}
                        width={"100%"}
                        height={"100%"}
                        gridArea={"image"}
                        zIndex={0}
                        // id={`${item.project_id}_${item.node_id}_${subItem.tensorId}`}
                    />
                )}
                {item?.is_ready && (
                    <>
                        <DetailsButtonBar
                            key={"details_button_bar"}
                            transform={snap.subItem ? "translateY(-2rem)" : "unset"}
                            gridArea={"commandBar"}
                            item={item}
                            project={snap.project}
                            show={isVisible}
                            subItem={snap.subItem}
                            videoRef={videoContextRef}
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
                    </>
                )}
                <DetailsContent
                    data-solid
                    gridArea={"content"}
                    // height={snap.minimizeContent ? "4rem" : "10rem"}
                    maxHeight={"full"}
                    zIndex={2}
                    item={item}
                    details={itemDetails}
                    flex={"0 1 auto"}
                    justifySelf={snap.minimizeContent ? "flex-end" : "stretch"}
                    padding={snap.minimizeContent ? -2 : undefined}
                />
            </DetailsOverlayContainer>
        </DTImageProvider>
    )
}

export default Overlay
