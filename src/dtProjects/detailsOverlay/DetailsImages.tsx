import { Spinner, VStack } from "@chakra-ui/react"
import type { Snapshot } from "valtio"
import type { DTImageFull } from "@/commands"
import urls from "@/commands/urls"
import { VideoContext, type VideoContextType } from "@/components/video/context"
import Seekbar from "@/components/video/Seekbar"
import Video from "@/components/video/Video"
import { VideoImage } from "@/components/video/VideoImage"
import type { ImageExtra } from "@/generated/types"
import { useGetContext } from "@/hooks/useGetContext"
import type { UIControllerState } from "../state/uiState"
import { DetailsSpinnerRoot } from "./common"
import DetailsImage from "./DetailsImage"

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

    const srcHalf = urls.thumbHalf(item)
    const srcFull = urls.thumb(item)

    const width = subItem?.width ?? itemDetails?.node?.start_width ?? item.start_width
    const height = subItem?.height ?? itemDetails?.node?.start_height ?? item.start_height

    return (
        <>
            {(itemDetails?.node.clip_id ?? -1) >= 0 ? (
                <VStack onClick={(e) => e.stopPropagation()}>
                    <Video image={item} autoStart={false}>
                        <Extractor />
                        <VideoImage clickToPause />
                        <Seekbar />
                    </Video>
                </VStack>
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
                <DetailsImage
                    key={"subitem_image"}
                    padding={8}
                    paddingTop={2}
                    width={"100%"}
                    height={"100%"}
                    gridArea={"image"}
                    zIndex={0}
                    id={`${item.project_id}_${item.node_id}_${subItem.tensorId}`}
                    pixelated={subItem.tensorId?.startsWith("color")}
                    maskSrc={subItem.applyMask ? subItem.maskUrl : undefined}
                    src={subItem.url}
                    naturalSize={{
                        width: subItem.width ?? 1,
                        height: subItem.height ?? 1,
                    }}
                    subitem={true}
                />
            )}
        </>
    )
}

export default DetailsImages
