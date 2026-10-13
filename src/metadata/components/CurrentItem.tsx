import { Box, Flex, Spinner } from "@chakra-ui/react"
import { useSnapshot } from "valtio"
import { SpinnerRoot } from "@/components/common"
import { useMetadataStore } from "../state/metadataStore2"
import CurrentImage from "./CurrentImage"
import CurrentVideo from "./CurrentVideo"

interface CurrentItemProps extends ChakraProps {}

function CurrentItem(props: CurrentItemProps) {
    const { ...restProps } = props

    const mdStore = useMetadataStore()
    const snap = useSnapshot(mdStore.state)
    const { currentItem, isLoadingImage } = snap

    let Item: React.ComponentType | null = null
    if (currentItem?.url) {
        Item = currentItem.isVideo ? CurrentVideo : CurrentImage
    }

    return (
        <Box
            role={"tabpanel"}
            id={`image-${(currentItem?.id ?? "no-item")}`}
            aria-labelledby={`image-item-${(currentItem?.id ?? "no-item")}`}
            position={"relative"}
            flex={"1 1 auto"}
            display="flex"
            justifyContent="center"
            alignItems="center"
            minWidth={0}
            minHeight={0}
            padding={currentItem ? 1 : 8}
            width={"100%"}
            {...restProps}
        >
            {Item ? (
                <Item key={currentItem?.id} />
            ) : (
                <Flex
                    position={"relative"}
                    color={"fg/50"}
                    fontSize={"xl"}
                    justifyContent={"center"}
                    alignItems={"center"}
                >
                    {!isLoadingImage && "Drop image here"}
                </Flex>
            )}
            {isLoadingImage && (
                <SpinnerRoot zIndex={8}>
                    <Spinner width={"100%"} height={"100%"} color={"white"} />
                </SpinnerRoot>
            )}
        </Box>
    )
}

export default CurrentItem
