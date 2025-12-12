import { Button, HStack, Input, VStack } from "@chakra-ui/react"
import { motion } from "motion/react"
import { useEffect } from "react"
import { useSnapshot } from "valtio"
import { PanelButton } from "@/components"
import TabContent from "@/metadata/infoPanel/TabContent"
import { useDTProjects } from "../state/projectStore"
import SearchFilter from "./filters/SearchFilter"

interface SearchPanelComponentProps extends ChakraProps {}

function SearchPanel(props: SearchPanelComponentProps) {
	const { ...restProps } = props
	const { store } = useDTProjects()
	const searchService = store.search
	const searchSnap = useSnapshot(searchService.state)

	useEffect(() => {
		store.listModels()
	}, [store.listModels])

	return (
		<TabContent value={"search"} overflowX={"clip"} {...restProps}>
			<Input
				bgColor={"bg.3"}
				value={searchService.state.searchInput}
				onChange={(e) => {
					searchService.state.searchInput = e.target.value
				}}
				border={"2px solid gray"}
				borderRadius={"lg"}
				placeholder="Search"
				width={"full"}
				asChild
			>
				<motion.input layoutId="search-indicator" transition={{ layout: { duration: 0 } }} />
			</Input>

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
					<SearchFilter
						index={filter.index}
						key={filter.index}
						onRemove={() => searchService.removeFilter(filter.index)}
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
				onClick={() => searchService.addEmptyFilter(true)}
			>
				Add Filter
			</Button>
			<HStack marginTop={4} width={"full"}>
				<PanelButton
					boxShadow={"xs"}
					flex={"0 0 auto"}
					onClick={() => {
						searchService.state.searchInput = ""
						searchService.clearFilters()
					}}
				>
					Clear
				</PanelButton>
				<PanelButton boxShadow={"xs"} flex={"1 1 auto"} onClick={() => searchService.applySearch()}>
					Search
				</PanelButton>
			</HStack>
		</TabContent>
	)
}

export default SearchPanel
