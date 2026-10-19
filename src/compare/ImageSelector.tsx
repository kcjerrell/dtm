import { IconButton } from "@/components"
import { useRootElementRef } from "@/hooks/useRootElement"
import { useTimeout } from "@/hooks/useTimeout"
import { useMetadataStore } from "@/metadata/state/metadataStore2"
import MediaStore from "@/state/mediaStore"
import { Popover, Portal } from "@chakra-ui/react"
import { useCallback, useState } from "react"
import { useSnapshot } from "valtio/react"

export interface ImageSelectorProps extends ChakraProps {}

function ImageSelector(props: ImageSelectorProps) {
    const { ...restProps } = props

    const viewRef = useRootElementRef("view")

    const [isOpen, setIsOpen] = useState(false)
    const [startCloseTimer, cancelCloseTimer] = useTimeout({
        fn: () => setIsOpen(false),
        delay: 600,
    })

    const onEnter = useCallback(() => {
        cancelCloseTimer()
        setIsOpen(true)
    }, [cancelCloseTimer])

    const store = useMetadataStore()
    const images = store.collection.useMapItems()
    // const imagesSnap = useSnapshot(images)

    return (
        <Popover.Root positioning={{ placement: "top" }} open={isOpen}>
            <Popover.Trigger asChild>
                <IconButton
                    onMouseEnter={() => onEnter()}
                    onMouseLeave={() => startCloseTimer()}
                >
                    A
                </IconButton>
            </Popover.Trigger>
            <Portal container={viewRef}>
                <Popover.Positioner>
                    <Popover.Content>Hello</Popover.Content>
                </Popover.Positioner>
            </Portal>
        </Popover.Root>
    )
}

export default ImageSelector
