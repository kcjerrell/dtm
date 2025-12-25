import { Box, chakra, Grid } from "@chakra-ui/react"
import { useCallback, useEffect, useRef } from "react"
import { proxy, useSnapshot } from "valtio"
import type { ContainerEvent } from "@/dtProjects/state/StateController"
import { usePagedItemSource } from "./PagedItemSource"

export interface PVGridProps<T, P = unknown> extends ChakraProps {
		itemComponent: PVGridItemComponent<T, P>
		/** number of screens */
		overscan?: number
		keyFn?: (item: T, index: number) => string | number
		initialRowCount?: number
		itemProps?: P
		maxItemSize: number
		getItems: (skip: number, take: number) => Promise<T[]>
		getCount: () => Promise<number>
		onImagesChanged?: ContainerEvent<"imagesChanged">
	}

export type PVGridItemComponent<T, P = unknown> = React.ComponentType<PVGridItemProps<T, P>>

type StateProxy<T> = {
	minThreshold: number
	maxThreshold: number
	firstRow: number
	lastRow: number
	visibleHeight: number
	columns: number
	rowHeight: number
	rowPos: number
}

function PVGridWrapper<T, P = unknown>(props: Partial<PVGridProps<T, P>>) {
	const { itemComponent, getItems, getCount, maxItemSize, ...restProps } = props

	if (!getItems || !getCount || !maxItemSize || !itemComponent) {
		return <Box {...restProps} />
	}

	return <PVGrid<T, P> {...props} />
}

function PVGrid<T, P = unknown>(props: PVGridProps<T, P>) {
	const {
		itemComponent,
		getItems,
		getCount,
		keyFn,
		initialRowCount = 10,
		overscan = 2,
		itemProps,
		maxItemSize,
		onImagesChanged,
		...restProps
	} = props
	const Item = itemComponent
	const { renderItems, totalCount, setRenderWindow, clearItems } = usePagedItemSource({
		getItems,
		getCount,
		pageSize: 250,
	})

	const stateRef = useRef<StateProxy<T>>(null)
	if (stateRef.current === null) {
		stateRef.current = proxy({
			minThreshold: 0,
			firstRow: 0,
			lastRow: initialRowCount,
			maxThreshold: 0,
			visibleHeight: 1,
			columns: 1,
			rowHeight: 1,
			rowPos: 0,
		})
	}
	const state = stateRef.current as StateProxy<T>
	const snap = useSnapshot(state)

	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const scrollContentRef = useRef<HTMLDivElement>(null)
	const topSpaceRef = useRef<HTMLDivElement>(null)

	const recalculate = useCallback(() => {
		if (!totalCount) return
		const scrollContent = scrollContentRef.current
		const scrollContainer = scrollContainerRef.current
		if (!scrollContent || !scrollContainer) return

		const { columns, rowHeight } = measure(scrollContent, maxItemSize)
		state.columns = columns
		state.rowHeight = rowHeight
		const firstVisibleRow = scrollContainer.scrollTop / rowHeight
		const rowsOnScreen = state.visibleHeight / rowHeight

		const firstRow = firstVisibleRow - rowsOnScreen * overscan
		state.firstRow = Math.max(0, Math.floor(firstRow))

		const lastRow = firstVisibleRow + rowsOnScreen + rowsOnScreen * overscan
		state.lastRow = Math.min(Math.ceil(lastRow), Math.ceil(totalCount / columns))

		state.minThreshold = (state.firstRow * rowHeight + scrollContainer.scrollTop) / 2
		state.maxThreshold = (state.lastRow * rowHeight + scrollContainer.scrollTop) / 2

		setRenderWindow(state.firstRow * columns, state.lastRow * columns)
	}, [state, overscan, maxItemSize, totalCount, setRenderWindow])

	const handleScroll = useCallback(
		(e: React.UIEvent<HTMLDivElement, UIEvent>) => {
			if (!scrollContainerRef.current) return
			state.rowPos = scrollContainerRef.current.scrollTop / state.rowHeight
			if (
				e.currentTarget.scrollTop < state.minThreshold ||
				e.currentTarget.scrollTop > state.maxThreshold
			) {
				recalculate()
			}
		},
		[recalculate, state],
	)

	useEffect(() => {
		recalculate()
	}, [recalculate])

	useEffect(() => {
		const handler = () => {
			clearItems()
		}
		onImagesChanged?.on(handler)
		return () => {
			onImagesChanged?.off(handler)
		}
	}, [onImagesChanged, clearItems])

	useEffect(() => {
		if (!scrollContainerRef.current) return
		const ro = new ResizeObserver(() => {
			if (!scrollContainerRef.current) return
			state.visibleHeight = scrollContainerRef.current.clientHeight
			const itemPos = state.rowPos * state.columns
			recalculate()
			const rowPos = itemPos / state.columns
			scrollContainerRef.current.scrollTo({
				top: rowPos * state.rowHeight,
				behavior: "instant",
			})
		})
		ro.observe(scrollContainerRef.current)

		return () => ro.disconnect()
	}, [state, recalculate])

	return (
		<Container
			ref={scrollContainerRef}
			position={"relative"}
			onScroll={(e) => handleScroll(e)}
			{...restProps}
		>
			<Grid
				gap={0}
				ref={scrollContentRef}
				gridTemplateColumns={`repeat(${snap.columns}, 1fr)`}
				gridTemplateRows={`repeat(${Math.ceil(totalCount / snap.columns)}, ${snap.rowHeight}px)`}
			>
				<Box
					ref={topSpaceRef}
					display={snap.firstRow === 0 ? "none" : "block"}
					gridRow={`1 / ${snap.firstRow + 1}`}
					gridColumn={`1 / span ${snap.columns}`}
				/>
				{renderItems.map((item, i) => {
					const index = i + snap.firstRow * snap.columns
					return (
						<Item
							gridRow={`${Math.floor(index / snap.columns) + 1}`}
							gridColumn={`${(index % snap.columns) + 1}`}
							index={index}
							value={item}
							key={item ? keyFn?.(item, index) : index}
							itemProps={itemProps}
						/>
					)
				})}
				{/* <Box
					ref={bottomSpaceRef}
					gridRow={`${snap.lastRow + 2} / ${Math.ceil(totalCount / snap.columns) + 2}`}
					gridColumn={`1 / span ${snap.columns}`}
					>
					{totalCount}
					</Box> */}
			</Grid>

			{/* {createPortal(
				<Box position={"absolute"} bottom={2} right={2} whiteSpace={"pre-"}>
					Items: {items.length} <br />
					Current Item: {snap.currentItem} <br />
					Updates: {snap.updates} <br />
					Rendered: {snap.firstIndex} to {snap.lastIndex} <br />
					Height: {snap.visibleHeight}
				</Box>,
				document.getElementById("root"),
			)} */}
		</Container>
	)
}

const Container = chakra("div", {
	base: {
		overflowY: "auto",
		overflowX: "visible",
		scrollBehavior: "smooth",
		overscrollBehavior: "contain",
		scrollbarGutter: "stable",
		scrollbarWidth: "thin",
		maxHeight: "100%",
	},
})

const Content = chakra("div", {
	base: {
		width: "100%",
		minHeight: "100%",
		overflowY: "visible",
		display: "grid",
		gridTemplateColumns: "1fr",
		justifyContent: "flex-start",
		alignItems: "stretch",
		gap: 0,
	},
})

export default PVGridWrapper

function measure(grid: HTMLDivElement, maxItemSize: number) {
	if (!grid || grid.children.length === 0) return { columns: 1, rowHeight: 1 }

	// const columns = Math.ceil(grid.offsetWidth / maxItemSize)
	const columns = Math.ceil(maxItemSize)
	const itemSize = grid.offsetWidth / columns

	return {
		columns,
		rowHeight: itemSize,
	}

	// let columns = 0
	// for (let i = 1; i < grid.children.length; i++) {
	// 	columns++
	// 	if (
	// 		(grid.children[i - 1] as HTMLElement).offsetLeft >
	// 		(grid.children[i] as HTMLElement).offsetLeft
	// 	)
	// 		break
	// }

	// return {
	// 	columns,
	// 	rowHeight: (grid.children[0] as HTMLElement).offsetWidth,
	// }
}
