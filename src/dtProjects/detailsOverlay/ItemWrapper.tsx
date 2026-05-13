import type { Snapshot } from "valtio"
import type { DTImageFull, ImageExtra } from "@/commands"
import urls from "@/commands/urls"
import type { VideoContextType } from "@/components/video/context"
import type { UIControllerState } from "../state/uiState"
import type { CanvasStack, SubItem } from "../types"
import DetailsImage from "./DetailsImage"
import ImageFallback from "./ImageFallback"
import VideoItem from "./VideoItem"
import { TensorHistoryNode } from "@/commands/DTProjectTypes"

interface ItemWrapperProps {
    item: ImageExtra
    itemDetails?: Snapshot<TensorHistoryNode>
    subItem?: Snapshot<UIControllerState["detailsView"]["subItem"]>
    showSpinner: boolean
    videoRef?: React.RefObject<VideoContextType | null>
}

function ItemWrapper(props: ItemWrapperProps) {
    const { item, itemDetails, subItem, showSpinner, videoRef } = props

    if (!item) return null
    if (!item.is_ready) return <ImageFallback />

    const size = getSize(item, itemDetails, subItem)

    if ((itemDetails?.data.clip_id ?? -1) >= 0) {
        return (
            <VideoItem
                item={item}
                videoRef={videoRef}
                naturalWidth={size.width}
                naturalHeight={size.height}
            />
        )
    }

    const srcHalf = urls.thumbHalf(item)
    const srcFull = urls.thumb(item)

    return (
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
            naturalSize={size}
            dimmed={!!subItem}
        />
    )
}

export default ItemWrapper

function getSize(
    item: ImageExtra,
    itemDetails: Snapshot<TensorHistoryNode> | undefined,
    subItem: Snapshot<SubItem | CanvasStack | null> | undefined,
): { width: number; height: number } {
    if (subItem && "width" in subItem && subItem.width && "height" in subItem && subItem.height) {
        return { width: subItem.width, height: subItem.height }
    }

    const width = itemDetails?.data?.start_width ?? item.start_width * 64
    const height = itemDetails?.data?.start_height ?? item.start_height * 64
    return { width, height }
}
