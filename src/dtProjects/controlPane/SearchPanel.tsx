import { PanelButton } from "@/components"
import TabContent from "@/metadata/infoPanel/TabContent"
import { useUiState } from "@/metadata/state/uiState"
import { Input } from "@chakra-ui/react"
import { setImagesSource } from "../state/projectStore"

interface SearchPanelComponentProps extends ChakraProps {}

function SearchPanel(props: SearchPanelComponentProps) {
	const { ...restProps } = props
	const { uiSnap, uiState } = useUiState()

	return (
		<TabContent value={"search"} {...restProps}>
			<Input
				value={uiSnap.searchInput}
				onChange={(e) => {
					uiState.searchInput = e.target.value
				}}
			></Input>
			<PanelButton
				onClick={() => {
					setImagesSource({ search: uiSnap.searchInput })
				}}
			>
				Search
			</PanelButton>
		</TabContent>
	)
}

export default SearchPanel
