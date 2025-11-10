import { Box, chakra, VStack } from "@chakra-ui/react"
import { type JSX, useCallback, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { proxy, useSnapshot } from "valtio"
import { proxyMap } from "valtio/utils"
import { Mutex } from "async-mutex"

export interface PVListProps<T, P = unknown> extends ChakraProps {
	itemComponent: PVListItemComponent<T, P>
	/** number of screens */
	overscan?: number
	keyFn?: (item: T, index: number) => string | number
	initialRenderCount?: number
	itemProps?: P
	totalCount: number
	pageSize: number
	getItems: (skip: number, take: number) => Promise<(T | undefined)[]>
}

export type PVListItemComponent<T, P = unknown> = React.ComponentType<PVListItemProps<T, P>>

export interface PVListItemProps<T, P = unknown> {
	value: T | Readonly<T> | null
	index: number
	itemProps: P
	onSizeChanged?: (index: number, isBaseSize: boolean) => void
}

type Page<T> = {
	/** inclusive */
	from: number
	/** inclusive */
	to: number
	items: T[]
}

type ProxyMap<K, V> = ReturnType<typeof proxyMap<K, V>>
type StateProxy<T> = {
	preSpacerHeight: number
	postSpacerHeight: number
	minThreshold: number
	maxThreshold: number
	firstIndex: number
	lastIndex: number
	visibleHeight: number
	expanded: ReturnType<typeof proxyMap<number, number>>
	pages: Page<T>[]
	renderItems: (T | null)[]
}
function PVList<T, P = unknown>(props: PVListProps<T, P>) {
	const {
		itemComponent,
		keyFn,
		initialRenderCount = 50,
		overscan = 2,
		itemProps,
		totalCount,
		pageSize,
		getItems,
		...restProps
	} = props
	const Item = itemComponent

	const stateRef = useRef<StateProxy<T>>(null)
	if (stateRef.current === null) {
		stateRef.current = proxy({
			preSpacerHeight: 0,
			minThreshold: 0,
			firstIndex: 0,
			lastIndex: initialRenderCount,
			maxThreshold: 0,
			postSpacerHeight: 0,
			visibleHeight: 1,
			expanded: proxyMap<number, number>(),
			pages: [],
			renderItems: [],
		})
	}
	const state = stateRef.current as StateProxy<T>
	const snap = useSnapshot(state)

	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const scrollContentRef = useRef<HTMLDivElement>(null)
	const topSpaceRef = useRef<HTMLDivElement>(null)
	const bottomSpaceRef = useRef<HTMLDivElement>(null)

	const pageLoader = useRef(new Mutex())
	const loadersWaiting = useRef(0)

	const ensurePages = useCallback(async () => {
		loadersWaiting.current++
		await pageLoader.current.runExclusive(async () => {
			loadersWaiting.current--
			const { firstIndex, lastIndex, pages } = state

			const firstPage = Math.floor(firstIndex / pageSize)
			const lastPage = Math.floor(lastIndex / pageSize)

			let pagesLoaded = 0

			for (let i = firstPage; i <= lastPage; i++) {
				if (pages[i]) continue
				const page = await getItems(i * pageSize, pageSize)
				pages[i] = { from: i * pageSize, to: (i + 1) * pageSize - 1, items: page }
				pagesLoaded++
			}

			if (pagesLoaded) setRenderItems(state)

			// if a loader is waiting, we'll go ahead and yield
			if (loadersWaiting.current) return

			// if not, let's check for the neighboring pages
			const nextPage = Math.min(lastPage + 1, Math.ceil(totalCount / pageSize) - 1)
			if (!pages[nextPage]) {
				const page = await getItems(nextPage * pageSize, pageSize)
				pages[nextPage] = {
					from: nextPage * pageSize,
					to: (nextPage + 1) * pageSize - 1,
					items: page,
				}
			}
			const prevPage = Math.max(firstPage - 1, 0)
			if (!pages[prevPage]) {
				const page = await getItems(prevPage * pageSize, pageSize)
				pages[prevPage] = {
					from: prevPage * pageSize,
					to: (prevPage + 1) * pageSize - 1,
					items: page,
				}
			}
		})
	}, [pageSize, state, getItems, totalCount])

	const setRenderWindow = useCallback(
		(first: number, last: number) => {
			state.firstIndex = first
			state.lastIndex = last

			setRenderItems(state)
			ensurePages()
		},
		[state, ensurePages],
	)

	const calcFirstAndLastIndex = useCallback(() => {
		const container = scrollContainerRef.current
		const content = scrollContentRef.current
		if (!container || !content) return { first: -1, last: -1 }

		const scrollTop = container.scrollTop
		const scrollBottom = scrollTop + container.clientHeight
		const itemHeight = getItemHeight(content, state.expanded, state.firstIndex)

		let first = -1
		let last = -1

		let t = 0
		for (let i = 0; i < totalCount; i++) {
			const h = state.expanded.get(i) ?? itemHeight
			t += h
			if (first === -1 && t >= scrollTop) first = i
			if (t >= scrollBottom) {
				last = i
				break
			}
		}

		return { first, last }
	}, [totalCount, state])

	const recalculate = useCallback(() => {
		const scrollContent = scrollContentRef.current
		const scrollContainer = scrollContainerRef.current
		if (!scrollContent || !scrollContainer) return

		const { first, last } = calcFirstAndLastIndex()
		if (first === -1 || last === -1) return
		const visibleItemsCount = last - first + 1

		const itemHeight = getItemHeight(scrollContent, state.expanded, state.firstIndex)

		const firstIndex = Math.max(0, first - visibleItemsCount * overscan)
		const lastIndex = Math.min(totalCount, last + visibleItemsCount * overscan)
		setRenderWindow(firstIndex, lastIndex)

		const [pre, mid, post] = calcRangeHeights(
			state.firstIndex,
			state.lastIndex,
			totalCount,
			itemHeight,
			state.expanded,
		)

		state.preSpacerHeight = pre
		state.postSpacerHeight = post

		state.minThreshold = (scrollContainer.scrollTop + pre) / 2
		const scrollBottom = scrollContainer.scrollTop + scrollContainer.clientHeight
		state.maxThreshold = (scrollBottom + pre + mid) / 2 - scrollContainer.clientHeight
	}, [totalCount, overscan, state, calcFirstAndLastIndex, setRenderWindow])

	const handleScroll = useCallback(
		(e: React.UIEvent<HTMLDivElement, UIEvent>) => {
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
		if (!scrollContainerRef.current) return
		const ro = new ResizeObserver(() => {
			if (!scrollContainerRef.current) return
			state.visibleHeight = scrollContainerRef.current.clientHeight
			recalculate()
		})
		ro.observe(scrollContainerRef.current)

		return () => ro.disconnect()
	}, [state, recalculate])

	const handleSizeChanged = useCallback(
		(index: number, baseSize: boolean) => {
			const actualIndex = index - snap.firstIndex + 1

			if (baseSize) {
				state.expanded.delete(index)
				return
			}

			const element = scrollContentRef.current?.children[actualIndex] as HTMLDivElement
			const nextElement = scrollContainerRef.current?.firstElementChild?.children[
				actualIndex + 1
			] as HTMLDivElement
			state.expanded.set(index, nextElement?.offsetTop - element?.offsetTop)
		},
		[state, snap.firstIndex],
	)

	return (
		<Container
			ref={scrollContainerRef}
			position={"relative"}
			onScroll={(e) => handleScroll(e)}
			{...restProps}
		>
			<VStack ref={scrollContentRef}>
				<Box ref={topSpaceRef} height={`${snap.preSpacerHeight}px`} />
				{snap.renderItems.map((item, i) => {
					const index = i + snap.firstIndex
					return (
						<Item
							index={index}
							onSizeChanged={handleSizeChanged}
							value={item}
							key={keyFn?.(item, index) ?? i}
							itemProps={itemProps}
						/>
					)
				})}
				<div
					ref={bottomSpaceRef}
					style={{
						height: `${snap.postSpacerHeight}px`,
					}}
				>
					{snap.postSpacerHeight} {totalCount}
				</div>
			</VStack>

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

export default PVList

function getItemHeight(
	container: HTMLDivElement | null,
	expanded: Map<number, number>,
	first: number,
) {
	if (!container) return 1

	if (!container || container.childNodes.length <= 2) return 1
	if (container.childNodes.length === 3)
		return (container.childNodes[1] as HTMLDivElement).clientHeight

	// instead of getting the item height, I need the distance to the next item
	// and thanks to the spacer there will always be a next item so I don't have to worry about checking
	let actual = -1
	for (let i = 1; i < container.childNodes.length - 1; i++) {
		actual = first + i - 1
		if (expanded.has(actual)) continue

		const a = container.childNodes[i] as HTMLDivElement
		const b = container.childNodes[i + 1] as HTMLDivElement

		return b.offsetTop - a.offsetTop
	}

	return 1
}

function calcRangeHeights(
	first: number,
	last: number,
	length: number,
	baseHeight: number,
	expanded: ProxyMap<number, number>,
) {
	const [pre, mid, post] = sumGroups(expanded, first, last)

	const preCount = first
	const preHeight = (preCount - pre.count) * baseHeight + pre.sum

	const midCount = last - first + 1
	const midHeight = (midCount - mid.count) * baseHeight + mid.sum

	const postCount = length - last - 1
	const postHeight = (postCount - post.count) * baseHeight + post.sum

	return [preHeight, midHeight, postHeight]
}

function sumGroups(map: Map<number, number>, pre: number, post: number) {
	const preGroup = { sum: 0, count: 0 }
	const midGroup = { sum: 0, count: 0 }
	const postGroup = { sum: 0, count: 0 }

	for (const [k, v] of map.entries()) {
		if (k < pre) {
			preGroup.sum += v
			preGroup.count++
		} else if (k > post) {
			postGroup.sum += v
			postGroup.count++
		} else {
			midGroup.sum += v
			midGroup.count++
		}
	}

	return [preGroup, midGroup, postGroup]
}

function setRenderItems<T>(state: StateProxy<T>) {
	const { firstIndex, lastIndex, pages } = state

	function* getItems() {
		let index = firstIndex
		let page: Page<T> | undefined
		while (index <= lastIndex) {
			// assign the current page
			if (!page || page.to < index) {
				page = pages.find((p) => p && p.from <= index && p.to >= index)
			}

			// yield the item
			yield page?.items[index - page?.from] ?? null

			index++
		}
	}

	state.renderItems = [...getItems()]
}

/** returns the pages as {from: 0, to: 250} which should match the Page[] */
function getRequiredPages(firstIndex: number, lastIndex: number, pageSize: number) {
	const fromPage = Math.floor(firstIndex / pageSize)
	const toPage = Math.ceil(lastIndex / pageSize)

	return Array.from({ length: toPage - fromPage }, (_, i) => ({
		from: (i + fromPage) * pageSize,
		to: (i + fromPage + 1) * pageSize - 1,
	}))
}
