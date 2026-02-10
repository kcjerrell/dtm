import { useDTP } from "../state/context"
import SearchChip from "./SearchChip"

interface SearchTextWidgetProps extends ChakraProps {}

function SearchTextWidget(props: SearchTextWidgetProps) {
    const { ...restProps } = props
    const { images, uiState } = useDTP()
    const snap = images.useSnap()

    const searchText = snap.imageSource.search

    if (!searchText) return null

    return (
        <SearchChip
            shrink
            onClick={() => {
                uiState.setSelectedTab("search")
                uiState.state.shouldFocus = "searchInput"
            }}
            onClickX={() => images.setSearchText(undefined)}
            fontStyle={"italic"}
            {...restProps}
        >
            {searchText}
        </SearchChip>
    )
}

export default SearchTextWidget
