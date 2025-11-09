import { Box, chakra, VStack } from "@chakra-ui/react"
import { type JSX, useCallback, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { proxy, useSnapshot } from "valtio"
import { proxyMap } from "valtio/utils"

export interface VirtualizedListProps<T, P> extends ChakraProps {
	items: T[] | Readonly<T[]>
	itemComponent: React.ComponentType<VirtualizedListItemProps<T, P>>
	/** number of screens */
	overscan?: number
	keyFn?: (item: T, index: number) => string | number
	initialRenderCount?: number
	itemProps?: P
}

export interface VirtualizedListItemProps<T, P> {
	items: T[] | Readonly<T[]>
	value: T | Readonly<T>
	index: number
	itemProps: P
	onSizeChanged?: (index: number, isBaseSize: boolean) => void
}

type ProxyMap<K, V> = ReturnType<typeof proxyMap<K, V>>
type StateProxy = {
	currentItem: number
	updates: number
	preSpacerHeight: number
	postSpacerHeight: number
	minThreshold: number
	maxThreshold: number
	firstIndex: number
	lastIndex: number
	visibleHeight: number
	expanded: ReturnType<typeof proxyMap<number, number>>
}
function VirtualizedList<T, P extends Record<string, unknown>>(props: VirtualizedListProps<T, P>) {
	const {
		itemComponent,
		items,
		keyFn,
		initialRenderCount = 50,
		overscan = 2,
		itemProps,
		...restProps
	} = props
	const Item = itemComponent

	const stateRef = useRef<StateProxy>(null)
	if (stateRef.current === null) {
		stateRef.current = proxy({
			currentItem: 0,
			updates: 0,
			preSpacerHeight: 0,
			minThreshold: 0,
			firstIndex: 0,
			lastIndex: initialRenderCount,
			maxThreshold: 0,
			postSpacerHeight: 0,
			visibleHeight: 1,
			expanded: proxyMap<number, number>(),
		})
	}
	const state = stateRef.current as StateProxy
	const snap = useSnapshot(state)

	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const scrollContentRef = useRef<HTMLDivElement>(null)
	const topSpaceRef = useRef<HTMLDivElement>(null)
	const bottomSpaceRef = useRef<HTMLDivElement>(null)

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
		for (let i = 0; i < items.length; i++) {
			const h = state.expanded.get(i) ?? itemHeight
			t += h
			if (first === -1 && t >= scrollTop) first = i
			if (t >= scrollBottom) {
				last = i
				break
			}
		}

		return { first, last }
	}, [items.length, state])

	const recalculate = useCallback(() => {
		const scrollContent = scrollContentRef.current
		const scrollContainer = scrollContainerRef.current
		if (!scrollContent || !scrollContainer) return

		const { first, last } = calcFirstAndLastIndex()
		if (first === -1 || last === -1) return
		const visibleItemsCount = last - first + 1

		const itemHeight = getItemHeight(scrollContent, state.expanded, state.firstIndex)

		state.firstIndex = Math.max(0, first - visibleItemsCount * overscan)
		state.lastIndex = Math.min(items.length, last + visibleItemsCount * overscan)

		const [pre, mid, post] = calcRangeHeights(
			state.firstIndex,
			state.lastIndex,
			items.length,
			itemHeight,
			state.expanded,
		)

		state.preSpacerHeight = pre
		state.postSpacerHeight = post

		state.minThreshold = (scrollContainer.scrollTop + pre) / 2
		const scrollBottom = scrollContainer.scrollTop + scrollContainer.clientHeight
		state.maxThreshold = (scrollBottom + pre + mid) / 2 - scrollContainer.clientHeight
	}, [items.length, overscan, state, calcFirstAndLastIndex])

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
				{items.slice(snap.firstIndex, snap.lastIndex).map((item, i) => {
					const index = i + snap.firstIndex
					return (
						<Item
							index={index}
							items={items as T[]}
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
					{snap.postSpacerHeight} {items.length}
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

export default VirtualizedList

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
