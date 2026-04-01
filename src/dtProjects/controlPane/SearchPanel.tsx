import { Box, Button, chakra, Em, HStack, Textarea, VStack } from "@chakra-ui/react"
import { useEffect, useRef, useState } from "react"
import { PanelButton, Tooltip } from "@/components"
import { PiInfo } from "@/components/icons/icons"
import { CLOSE_TRANSIENT_POPUPS_EVENT } from "@/dtProjects/imagesList/ContentPanelPopup"
import TabContent from "@/metadata/infoPanel/TabContent"
import { useDTP } from "../state/context"
import SearchFilterForm from "./filters/SearchFilterForm"

interface SearchPanelComponentProps extends ChakraProps {}

function SearchPanel(props: SearchPanelComponentProps) {
    const { ...restProps } = props
    const { search, uiState } = useDTP()

    const searchSnap = search.useSnap()
    const { shouldFocus } = uiState.useSnap()

    const [searchInput, setSearchInput] = useState("")
    const searchInputRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        if (searchInputRef.current && shouldFocus === "searchInput") {
            searchInputRef.current.focus()
        }
    }, [shouldFocus])

    return (
        <TabContent
            value={"search"}
            overflowX={"clip"}
            height={"auto"}
            padding={2}
            justifyContent={"flex-start"}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    window.dispatchEvent(new Event(CLOSE_TRANSIENT_POPUPS_EVENT))
                    search.applySearch()
                }
            }}
            {...restProps}
        >
            <HStack>
                <Textarea
                    ref={searchInputRef}
                    data-defctx={true}
                    rows={1}
                    autoresize
                    bgColor={"bg.3"}
                    value={searchInput}
                    onChange={(e) => {
                        const value = e.target.value.replace(/\n/g, "")
                        setSearchInput(value)
                        search.state.searchInput = value
                    }}
                    border={"1px solid"}
                    borderColor={"grayc.13"}
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
                gap={0.5}
                bgColor={"grayc.13"}
                // border={"1px solid"}
                // borderColor={"grayc.11"}
                // _dark={{ borderColor: "grayc.15" }}
                width={"100%"}
                alignItems={"stretch"}
                paddingY={0.5}
                paddingX={0.5}
                marginY={2}
                borderRadius={"lg"}
                // boxShadow={"0px 1px 8px -4px #00000033"}
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
                aria-label="Add search filter"
                unstyled
                width={"max-content"}
                height={"auto"}
                marginX={"auto"}
                padding={2}
                color={"fg.2"}
                _hover={{ textDecoration: "underline", color: "fg.1" }}
                fontSize={"sm"}
                // cursor={"pointer"}
                onClick={() => search.addEmptyFilter(true)}
            >
                Add Filter
            </Button>
            <HStack marginTop={4} width={"full"} gap={0}>
                <PanelButton
                    aria-label="Reset search"
                    borderLeftRadius={"lg"}
                    borderRightRadius={"none"}
                    boxShadow={"xs"}
                    flex={"0 0 auto"}
                    onClick={() => {
                        setSearchInput("")
                        search.state.searchInput = ""
                        search.clearFilters()
                    }}
                >
                    Reset
                </PanelButton>
                <PanelButton
                    aria-label="Apply search"
                    borderLeftRadius={"none"}
                    borderRightRadius={"lg"}
                    boxShadow={"xs"}
                    flex={"1 1 auto"}
                    onClick={() => {
                        window.dispatchEvent(new Event(CLOSE_TRANSIENT_POPUPS_EVENT))
                        search.applySearch()
                    }}
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
