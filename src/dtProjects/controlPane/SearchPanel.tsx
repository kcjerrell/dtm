import TabContent from "@/metadata/infoPanel/TabContent"

interface SearchPanelComponentProps extends ChakraProps {}

function SearchPanel(props: SearchPanelComponentProps) {
	const { ...restProps } = props

	return (
		<TabContent value={"search"} {...restProps}>
			search
		</TabContent>
	)
}

export default SearchPanel
