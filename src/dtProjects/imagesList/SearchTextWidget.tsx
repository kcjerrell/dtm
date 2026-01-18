import { Box, HStack } from "@chakra-ui/react"
import { IconButton } from "@/components"
import { FiX } from "@/components/icons"
import { plural } from "@/utils/helpers"
import { useDTP } from "../state/context"

interface SearchTextWidgetProps extends ChakraProps {}

function SearchTextWidget(props: SearchTextWidgetProps) {
    const { ...restProps } = props
    const { images, uiState } = useDTP()
    const snap = images.useSnap()

    const search = snap.imageSource.search
    const filters = snap.imageSource.filters?.filter((f) => f.target !== "type").length

    if (!search && !filters) return null

    const searchText = search ? `${search}` : ""

    return (
        <HStack
            // gridArea={"1/1"}
            className={"group"}
            cursor={"pointer"}
            onClick={() => {
                uiState.setSelectedTab("search")
                uiState.state.shouldFocus = "searchInput"
            }}
            justifySelf={"flex-start"}
            {...restProps}
        >
            {!!searchText && <Box fontStyle={"italic"}>{searchText}</Box>}
            {!!filters && (
                <Box>
                    +{filters} filter{plural(filters)}
                </Box>
            )}
            <IconButton
                size="min"
                onClick={(e) => {
                    e.stopPropagation()
                    images.setSearchFilter()
                }}
                visibility="hidden"
                _groupHover={{ visibility: "visible" }}
            >
                <FiX />
            </IconButton>
        </HStack>
    )
}

export default SearchTextWidget
