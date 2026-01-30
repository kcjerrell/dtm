import { Box, Button, chakra, Em, HStack, Input, VStack } from "@chakra-ui/react"
import { useEffect, useRef, useState } from "react"
import { PanelButton, Tooltip } from "@/components"
import { PiInfo } from "@/components/icons/icons"
import TabContent from "@/metadata/infoPanel/TabContent"
import { useDTP } from "../state/context"
import SearchFilterForm from "./filters/SearchFilterForm"

interface SearchPanelComponentProps extends ChakraProps {}

function SearchPanel(props: SearchPanelComponentProps) {
    const { ...restProps } = props
    const { models, search, uiState } = useDTP()

    const searchSnap = search.useSnap()
    const { shouldFocus } = uiState.useSnap()

    const [searchInput, setSearchInput] = useState("")
    const searchInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        models.refreshModels()
    }, [models.refreshModels])

    useEffect(() => {
        if (searchInputRef.current && shouldFocus === "searchInput") {
            searchInputRef.current.focus()
        }
    }, [shouldFocus])

    // useEffect(() => {
    // searchService.incLayoutId()
    // }, [searchService.incLayoutId])

    return (
        <TabContent
            value={"search"}
            overflowX={"clip"}
            height={"auto"}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    search.applySearch()
                }
            }}
            {...restProps}
        >
            <HStack>
                <Input
                    ref={searchInputRef}
                    bgColor={"bg.3"}
                    value={searchInput}
                    onChange={(e) => {
                        setSearchInput(e.target.value)
                        search.state.searchInput = e.target.value
                    }}
                    border={"2px solid gray"}
                    borderRadius={"lg"}
                    placeholder="Search"
                    width={"full"}
                />
                <Tooltip tip={<SearchInfo />}>
                    <PiInfo size={16} />
                </Tooltip>
            </HStack>
            <VStack
                display={searchSnap.filters.length > 0 ? "flex" : "none"}
                gap={1}
                bgColor={"bg.1"}
                // borderBlock={"0.25rem solid {colors.bg.1}"}
                width={"100%"}
                alignItems={"stretch"}
                paddingY={1}
                paddingX={1}
                marginY={2}
                borderRadius={"sm"}
            >
                {searchSnap.filters.map((filter) => (
                    <SearchFilterForm
                        index={filter.index}
                        key={filter.index}
                        onRemove={() => search.removeFilter(filter.index)}
                    />
                ))}
            </VStack>
            <Button
                unstyled
                width={"max-content"}
                margin={"auto"}
                padding={2}
                color={"fg.2"}
                _hover={{ textDecoration: "underline", color: "fg.1" }}
                fontSize={"sm"}
                cursor={"pointer"}
                onClick={() => search.addEmptyFilter(true)}
            >
                Add Filter
            </Button>
            <HStack marginTop={4} width={"full"}>
                <PanelButton
                    boxShadow={"xs"}
                    flex={"0 0 auto"}
                    onClick={() => {
                        setSearchInput("")
                        search.state.searchInput = ""
                        search.clearFilters()
                    }}
                >
                    Clear
                </PanelButton>
                <PanelButton
                    boxShadow={"xs"}
                    flex={"1 1 auto"}
                    onClick={() => search.applySearch()}
                >
                    Search
                </PanelButton>
            </HStack>
        </TabContent>
    )
}

function SearchInfo() {
    return (
        <VStack fontSize={"sm"} alignItems={"flex-start"}>
            <Box>Images will match if the prompt contains any of the search terms.</Box>
            <Box>
                Search terms are stemmed, so <Em>shade</Em>, <Em>shades</Em>, <Em>shading</Em>, and{" "}
                <Em>shaded</Em> are all seen as the same word.
            </Box>
            <Box>Wrap words or phrases in "quotes" to require an exact text match.</Box>
            <B>cow boy</B>
            <Box marginTop={-2}>
                Matches images that have the words <Em>cow</Em> or <Em>boy</Em> in the prompt - but
                not <Em>cowboy</Em> since that is a different word
            </Box>
            <B>"cow" "boy"</B>
            <Box marginTop={-2}>
                Matches images that have both <Em>cow</Em> and <Em>boy</Em> in the prompt -
                including <Em>cowboys</Em>
            </Box>
            <B>"cow boy"</B>
            <Box marginTop={-2}>
                Matches images that have the exact phrase <Em>cow boy</Em> in the prompt
            </Box>
        </VStack>
    )
}

const B = chakra("span", {
    base: {
        fontWeight: "bold",
        marginBottom: "0",
    },
})

export default SearchPanel
