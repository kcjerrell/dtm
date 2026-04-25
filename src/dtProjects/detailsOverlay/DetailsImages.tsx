import { Grid, HStack, Spinner } from "@chakra-ui/react"
import type { Snapshot } from "valtio"
import type { DTImageFull, ImageExtra } from "@/commands"
import urls from "@/commands/urls"
import VideoAudio from "@/components/video/Audio"
import { VideoContext, type VideoContextType } from "@/components/video/context"
import MuteButton from "@/components/video/MuteButton"
import PlayPauseButton from "@/components/video/PlayPauseButton"
import Seekbar from "@/components/video/Seekbar"
import Video from "@/components/video/Video"
import { VideoImage } from "@/components/video/VideoImage"
import { useGetContext } from "@/hooks/useGetContext"
import type { UIControllerState } from "../state/uiState"
import type { CanvasStack, SubItem } from "../types"
import { DetailsSpinnerRoot } from "./common"
import DetailsImage from "./DetailsImage"
import ImageFallback from "./ImageFallback"
import SubItemWrapper from "./SubItemWrapper"

interface DetailsImagesProps {
    item: ImageExtra
    itemDetails?: Snapshot<DTImageFull>
    subItem?: Snapshot<UIControllerState["detailsView"]["subItem"]>
    showSpinner: boolean
    videoRef?: React.RefObject<VideoContextType | null>
}

function DetailsImages(props: DetailsImagesProps) {
    const { item, itemDetails, subItem, showSpinner, videoRef } = props

    const { Extractor } = useGetContext(VideoContext, videoRef)

    if (!item) return null
    if (!item.is_ready) return <ImageFallback />

    const srcHalf = urls.thumbHalf(item)
    const srcFull = urls.thumb(item)

    const { width, height } = getSize(item, itemDetails, subItem)

    return (
        <>
            {(itemDetails?.node.clip_id ?? -1) >= 0 ? (
                <Grid
                    onClick={(e) => e.stopPropagation()}
                    templateRows={"1fr auto auto"}
                    // width={"100%"}
                    // height={"100%"}
                    maxHeight={"100%"}
                    overflow={"hidden"}
                    gridArea={"image"}
                >
                    <Video image={item} autoStart={false} key={item.id}>
                        <Extractor />
                        <VideoImage
                            clickToPause
                            data-solid
                            naturalSize={{ width: width * 64, height: height * 64 }}
                            width={"100%"}
                            height={"100%"}
                            maxWidth={"100%"}
                            maxHeight={"100%"}
                            fit={"contain"}
                            canvasStyle={{ borderRadius: "0.5rem" }}
                            borderRadius={"0.5rem"}
                        />
                        <VideoAudio />
                        <HStack data-solid="true" width={"100%"} paddingY={2} flexShrink={0}>
                            <PlayPauseButton />
                            <Seekbar />
                            <MuteButton />
                        </HStack>
                    </Video>
                </Grid>
            ) : (
                <DetailsImage
                    width={"100%"}
                    height={"100%"}
                    padding={0}
                    paddingTop={0}
                    gridArea={"image"}
                    zIndex={0}
                    id={`${item.project_id}_${item.node_id}`}
                    src={srcFull}
                    srcHalf={srcHalf}
                    naturalSize={{ width, height }}
                    dimmed={!!subItem}
                />
            )}
            {(showSpinner || subItem?.isLoading) && (
                <DetailsSpinnerRoot key={"subitem_spinner"} gridArea={"image"}>
                    <Spinner width={"100%"} height={"100%"} color={"white"} />
                </DetailsSpinnerRoot>
            )}
            {subItem && (
                <SubItemWrapper
                    subItem={subItem}
                    padding={8}
                    paddingTop={2}
                    width={"100%"}
                    height={"100%"}
                    gridArea={"image"}
                    zIndex={0}
                    // id={`${item.project_id}_${item.node_id}_${subItem.tensorId}`}
                />
            )}
        </>
    )
}

export default DetailsImages

function getSize(
    item: ImageExtra,
    itemDetails: Snapshot<DTImageFull> | undefined,
    subItem: Snapshot<SubItem | CanvasStack | null> | undefined,
): { width: number; height: number } {
    if (subItem && "width" in subItem && subItem.width && "height" in subItem && subItem.height) {
        return { width: subItem.width, height: subItem.height }
    }

    const width = itemDetails?.node?.start_width ?? item.start_width * 64
    const height = itemDetails?.node?.start_height ?? item.start_height * 64
    return { width, height }
}
