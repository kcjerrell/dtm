import { Box } from "@chakra-ui/react"
import { useCallback } from "react"
import type { ImageExtra } from "@/commands"
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

    const itemSource = images.useItemSource()

    const showDetailsOverlay = useCallback(
        (index: number) => {
            images.itemSource.activeItemIndex = index
        },
        [images],
    )

    return (
        <PVGrid<ImageExtra>
            freeze={!!uiSnap.detailsView?.item}
            inert={uiSnap.isGridInert}
            bgColor={"transparent"}
            key={imagesSnap.searchId}
            itemComponent={GridItemAnim as PVGridItemComponent<ImageExtra>}
            itemSource={itemSource}
            maxItemSize={imagesSnap.imageSize ?? 5}
            onImagesChanged={images.onImagesChanged}
            itemProps={{ showDetailsOverlay }}
            keyFn={keyFn}
            {...props}
        />
    )
}

function GridItemAnim(
    props: PVGridItemProps<
        ImageExtra,
        {
            showDetailsOverlay: (index: number) => void
        }
    >,
) {
    const { value: item, showDetailsOverlay, index } = props

    const previewId = `${item?.project_id}/${item?.preview_id}`
    const url = `dtm://dtproject/thumbhalf/${previewId}`

    return (
        <Box bgColor={"fg.1/20"} onClick={() => showDetailsOverlay(index)}>
            {item && (
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
        </Box>
    )
}

export default ImagesList
