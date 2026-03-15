import { useCallback, useState } from "react"
import type { ImageExtra } from "@/commands"
import PVGrid from "@/components/virtualizedList/PVGrid2"
import { useItemSelection } from "@/hooks/useIdSelection"
import { useMenuContext } from "../MenuContext"
import { useDTP } from "../state/context"
import GridImage from "./GridImage"

const keyFn = (item?: ImageExtra | null) => (item ? `${item.project_id}_${item.node_id}` : item)

function ImagesList(props: ChakraProps) {
    const { images, uiState } = useDTP()
    const uiSnap = uiState.useSnap()
    const imagesSnap = images.useSnap()
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
    const { snap: selectedIds, selectItem, clear } = useItemSelection<number>()

    const itemSource = images.useItemSource()
    const { selectImageMenuCommand } = useMenuContext()

    const showDetailsOverlay = useCallback(
        (index: number) => {
            images.itemSource.activeItemIndex = index
        },
        [images],
    )

    const onPointerEnter = useCallback((index: number) => {
        setHoveredIndex(() => {
            return index
        })
    }, [])

    const onPointerLeave = useCallback(() => {
        setHoveredIndex(null)
    }, [])

    const onContextMenu = useCallback(
        async (e: React.MouseEvent) => {
            const dataImageId = e.currentTarget.getAttribute("data-image-id")
            if (!dataImageId) return
            const imageId = Number(dataImageId)

            selectItem(imageId, true)
            try {
                const image = images.itemSource.findItem((image) => image.id === imageId)
                if (!image) return
                const execute = await selectImageMenuCommand([image], { isContextMenu: true })
                if (execute) {
                    await uiState.callWithImageSpinner(imageId, async () => {
                        await execute()
                    })
                }
            } finally {
                clear()
            }
        },
        [selectItem, images.itemSource, selectImageMenuCommand, uiState, clear],
    )

    return (
        <PVGrid<ImageExtra>
            onScroll={() => setHoveredIndex(null)}
            freeze={!!uiSnap.detailsView?.item}
            inert={uiSnap.isGridInert}
            bgColor={"transparent"}
            key={imagesSnap.searchId}
            itemComponent={GridImage}
            itemSource={itemSource}
            maxItemSize={imagesSnap.imageSize ?? 5}
            onImagesChanged={images.onImagesChanged}
            itemProps={{
                spinnerIds: uiSnap.imageSpinner,
                showDetailsOverlay,
                onPointerEnter,
                onPointerLeave,
                hoveredIndex,
                onContextMenu,
                selectedIds: selectedIds.size ? selectedIds : undefined,
            }}
            keyFn={keyFn}
            {...props}
        />
    )
}

export default ImagesList
