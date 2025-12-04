import { Button, Input, VStack } from "@chakra-ui/react"
import { useEffect } from "react"
import { useSnapshot } from "valtio"
import { PanelButton } from "@/components"
import TabContent from "@/metadata/infoPanel/TabContent"
import { setImagesSource, useDTProjects } from "../state/projectStore"
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
				value={searchService.state.searchInput}
				onChange={(e) => {
					searchService.state.searchInput = e.target.value
				}}
				border={"2px solid gray"}
				borderRadius={"lg"}
				placeholder="Search"
			></Input>
			<PanelButton
				onClick={() => {
					setImagesSource({ search: searchService.state.searchInput })
				}}
			>
				Search
			</PanelButton>

			<VStack
				gap={1}
				bgColor={"bg.1"}
				borderBlock={"0.25rem solid {colors.bg.1}"}
				width={"100%"}
				alignItems={"stretch"}
				paddingY={2}
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
			<Button marginTop={8} onClick={() => searchService.addEmptyFilter(true)}>
				Add Filter
			</Button>
		</TabContent>
	)
}

export default SearchPanel
