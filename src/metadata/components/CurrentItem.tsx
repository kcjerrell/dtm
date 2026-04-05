import { Box, Flex } from "@chakra-ui/react"
import { AnimatePresence } from "motion/react"
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

    console.log("current item", snap.currentItem)

    return (
        <Box
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
            <AnimatePresence mode={"popLayout"}>
                {Item ? (
                    <Item />
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
            </AnimatePresence>
        </Box>
    )
}

export default CurrentItem
