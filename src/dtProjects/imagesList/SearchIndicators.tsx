import { Grid, HStack } from "@chakra-ui/react"
import { FloatIndicator, IconButton } from "@/components"
import { useDTP } from "../state/context"
import { FiX } from "react-icons/fi"
import { AnimatePresence } from "motion/react"
import { TbSortAscending, TbSortAscending2, TbSortDescending2 } from "react-icons/tb"

interface SearchIndicatorProps extends ChakraProps {}

function SearchIndicator(props: SearchIndicatorProps) {
	const { ...restProps } = props
	const { images, uiState } = useDTP()
	const snap = images.useSnap()

	const hasSearch = !!snap.imageSource.search
	const hasFilters = !!snap.imageSource.filters?.length
	const selectedProjectCount = snap.imageSource.projectIds?.length ?? 0

	const sortDir = snap.imageSource?.direction

	return (
		<Grid templateColumns={"1fr 1fr 1fr"} justifyContent={"space-between"} {...restProps}>
			<AnimatePresence>
				{(snap.imageSource.search || snap.imageSource.filters?.length) && (
					<FloatIndicator.Root key={snap.imageSource.search} gridArea={"1/1"}>
						<FloatIndicator.Label
							justifySelf={"left"}
							fontStyle={hasSearch ? "italic" : "normal"}
							onClick={() => {
								uiState.setSelectedTab("search")
								uiState.state.shouldFocus = "searchInput"
							}}
						>
							{hasSearch
								? `"${snap.imageSource.search}"`
								: `${snap.imageSource.filters?.length} filters active`}
						</FloatIndicator.Label>
						<FloatIndicator.Extension>
							+{snap.imageSource.filters?.length ?? 0}
						</FloatIndicator.Extension>
						<FloatIndicator.Extension altExt>
							<IconButton
								size="min"
								onClick={() => {
									images.setSearchFilter()
								}}
							>
								<FiX />
							</IconButton>
						</FloatIndicator.Extension>
					</FloatIndicator.Root>
				)}

				{selectedProjectCount > 0 && (
					<FloatIndicator.Root key="project-selection" justifySelf={"center"} gridArea={"1/2"}>
						<FloatIndicator.Label>{selectedProjectCount} projects selected</FloatIndicator.Label>
						<FloatIndicator.Extension>
							<IconButton
								size="min"
								onClick={() => {
									images.setSelectedProjects([])
								}}
							>
								<FiX />
							</IconButton>
						</FloatIndicator.Extension>
					</FloatIndicator.Root>
				)}
				<FloatIndicator.Root gridArea={"1/3"} justifySelf={"flex-end"}>
					<FloatIndicator.Label>Date</FloatIndicator.Label>
					<FloatIndicator.Extension>
						{sortDir === "asc" && (
							<IconButton size="min" onClick={() => images.toggleSortDirection()}>
								<TbSortAscending2  />
							</IconButton>
						)}
						{sortDir === "desc" && (
							<IconButton size="min" onClick={() => images.toggleSortDirection()}>
								<TbSortDescending2 />
							</IconButton>
						)}
					</FloatIndicator.Extension>
				</FloatIndicator.Root>
			</AnimatePresence>
		</Grid>
	)
}

export default SearchIndicator
