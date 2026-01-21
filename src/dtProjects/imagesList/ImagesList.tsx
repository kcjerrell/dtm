import { Box } from "@chakra-ui/react"
import { useCallback, useState } from "react"
import type { ImageExtra } from "@/commands"
import FrameCountIndicator from "@/components/FrameCountIndicator"
import Video from "@/components/video/Video"
import { VideoImage } from "@/components/video/VideoImage"
import PVGrid, {
    type PVGridItemComponent,
    type PVGridItemProps,
} from "@/components/virtualizedList/PVGrid2"
import { useDTP } from "../state/context"

const keyFn = (item?: ImageExtra | null) => (item ? `${item.project_id}_${item.node_id}` : item)

function ImagesList(props: ChakraProps) {
    const { images, uiState } = useDTP()
    const uiSnap = uiState.useSnap()
    const imagesSnap = images.useSnap()
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

    const itemSource = images.useItemSource()

    const showDetailsOverlay = useCallback(
        (index: number) => {
            images.itemSource.activeItemIndex = index
        },
        [images],
    )

    const onPointerEnter = useCallback((index: number) => {
        setHoveredIndex((value) => {
            return index
        })
    }, [])

    const onPointerLeave = useCallback((index: number) => {
        setHoveredIndex(null)
    }, [])

    return (
        <PVGrid<ImageExtra>
            onScroll={() => setHoveredIndex(null)}
            freeze={!!uiSnap.detailsView?.item}
            inert={uiSnap.isGridInert}
            bgColor={"transparent"}
            key={imagesSnap.searchId}
            itemComponent={GridItemAnim as PVGridItemComponent<ImageExtra>}
            itemSource={itemSource}
            maxItemSize={imagesSnap.imageSize ?? 5}
            onImagesChanged={images.onImagesChanged}
            itemProps={{ showDetailsOverlay, onPointerEnter, onPointerLeave, hoveredIndex }}
            keyFn={keyFn}
            {...props}
        />
    )
}

function GridItemWrapper(
    props: PVGridItemProps<
        ImageExtra,
        {
            showDetailsOverlay: (index: number) => void
            onPointerEnter?: (index: number) => void
            onPointerLeave?: (index: number) => void
            hoveredIndex?: number
        }
    >,
) {
    const { value: item } = props
    if (!item) return null

    if ((item.num_frames ?? 0) > 0) {
        return <Video image={item} half />
    }
    return <GridItemAnim {...props} />
}

function GridItemAnim(
    props: PVGridItemProps<
        ImageExtra,
        {
            showDetailsOverlay: (index: number) => void
            onPointerEnter?: (index: number) => void
            onPointerLeave?: (index: number) => void
            hoveredIndex?: number
        }
    >,
) {
    const {
        value: item,
        showDetailsOverlay,
        index,
        hoveredIndex,
        onPointerEnter,
        onPointerLeave,
    } = props

    if (!item) return <Box />

    const previewId = `${item?.project_id}/${item?.preview_id}`
    const url = `dtm://dtproject/thumbhalf/${previewId}`

    const isVideo = (item.num_frames ?? 0) > 0
    const showVideo = isVideo && hoveredIndex === index

    return (
        <Box
            position={"relative"}
            bgColor={"fg.1/20"}
            onPointerEnter={() => onPointerEnter?.(index)}
            onPointerLeave={() => onPointerLeave?.(index)}
            onClick={() => showDetailsOverlay(index)}
        >
            {showVideo ? (
                <Video image={item} half autoStart>
                    <VideoImage width={"100%"} height={"100%"} objectFit={"cover"} />
                </Video>
            ) : (
                <div
                    key={url}
                    style={{
                        width: "100%",
                        height: "100%",
                    }}
                    // transition={{ duration: 0.25 }}
                >
                    <img
                        key={url}
                        style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            border: "1px solid #0000ff00",
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                        }}
                        // variants={{
                        // 	downscale: () => downScale(),
                        // }}
                        // initial="downscale"
                        // animate={{ scale: 1 }}
                        // exit="downscale"
                        src={url}
                        alt={item?.prompt}
                        // transition={{ duration: 0.25 }}
                    />
                </div>
            )}
            {isVideo && (
                // <PiFilmStrip
                //     style={{
                //         position: "absolute",
                //         bottom: 4,
                //         left: 4,
                //         width: 20,
                //         height: 20,
                //         color: "white",
                //         textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                //     }}
                // />
                <FrameCountIndicator
                    bgColor={"fg.1/70"}
                    position={"absolute"}
                    bottom={1}
                    left={1}
                    width={"1.5rem"}
                    // height={"2rem"}
                    color="bg.3"
                    // filter={"drop-shadow(0 0 2px rgba(0,0,0,1))"}
                    boxShadow={"0 0 2px rgba(0,0,0,1)"}
                    borderRadius={1}
                    count={item.num_frames ?? 0}
                />
            )}
        </Box>
    )
}

export default ImagesList
