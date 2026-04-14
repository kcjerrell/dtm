import { plural } from "@/utils/helpers"
import { useDTP } from "../state/context"
import SearchChip from "./SearchChip"

interface FiltersWidgetProps extends ChakraProps {}

function FiltersWidget(props: FiltersWidgetProps) {
    const { ...restProps } = props
    const { images, uiState } = useDTP()
    const snap = images.useSnap()

    const filtersCount = snap.imageSource.filters?.length ?? 0

    if (!filtersCount) return null

    return (
        <SearchChip
            ariaLabel={"Search filters"}
            onClick={() => {
                uiState.setSelectedTab("search")
            }}
            onClickX={() => images.setSearchFilters(undefined)}
            {...restProps}
        >
            {filtersCount} filter{plural(filtersCount)}
        </SearchChip>
    )
}

export default FiltersWidget
