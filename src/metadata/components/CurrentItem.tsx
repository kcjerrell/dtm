import { Box, Flex } from "@chakra-ui/react"
import { useSnapshot } from "valtio"
import { getMetadataStore } from "../state/metadataStore"
import CurrentImage from "./CurrentImage"
import CurrentVideo from "./CurrentVideo"

interface CurrentItemProps extends ChakraProps {}

function CurrentItem(props: CurrentItemProps) {
    const { ...restProps } = props

    const snap = useSnapshot(getMetadataStore())
    const { currentItem: currentImage } = snap

    let Item: React.ComponentType | null = null
    if (currentImage?.url) {
        Item = currentImage.isVideo ? CurrentVideo : CurrentImage
    }

    return (
        <Box
            role={"tabpanel"}
            id={`image-${(snap.currentIndex ?? 0) + 1}`}
            aria-labelledby={`image-item-${(snap.currentIndex ?? 0) + 1}`}
            position={"relative"}
            flex={"1 1 auto"}
            display="flex"
            justifyContent="center"
            alignItems="center"
            minWidth={0}
            minHeight={0}
            padding={currentImage ? 1 : 8}
            width={"100%"}
            {...restProps}
        >
            {Item ? (
                <Item key={currentImage?.id} />
            ) : (
                <Flex
                    color={"fg/50"}
                    fontSize={"xl"}
                    justifyContent={"center"}
                    alignItems={"center"}
                >
                    Drop image here
                </Flex>
            )}
        </Box>
    )
}

export default CurrentItem
