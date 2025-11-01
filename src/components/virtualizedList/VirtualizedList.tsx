import { Box, chakra } from "@chakra-ui/react"
import { get } from "http"
import { JSX, RefObject, useCallback, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { proxy, useSnapshot } from "valtio"

interface VirtualizedListProps<T> extends ChakraProps {
	overscan?: number
	itemComponent: (props: { value: T }) => JSX.Element
	items: T[] | Readonly<T[]>
	keyFn?: (item: T) => string | number
	estimatedItemSize: number | string
}

type StateProxy = {
	currentItem: number
	updates: number
	firstIndex: number
	lastIndex: number
	visibleHeight: number
}
let renderCount = 0
function VirtualizedList<T>(props: VirtualizedListProps<T>) {
	const { overscan = 10, itemComponent, items, keyFn, estimatedItemSize, ...restProps } = props

	const stateRef = useRef<StateProxy>(null)
	if (stateRef.current === null) {
		stateRef.current = proxy({
			currentItem: 0,
			updates: 0,
			firstIndex: 0,
			lastIndex: overscan * 4,
			visibleHeight: 1,
		})
	}
	const state = stateRef.current as StateProxy

	const containerRef = useRef<HTMLDivElement>(null)
	const topSpaceRef = useRef<HTMLDivElement>(null)
	const bottomSpaceRef = useRef<HTMLDivElement>(null)

	const lastScrollPos = useRef(0)

	const snap = useSnapshot(state)

	const Item = itemComponent
	const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement, UIEvent>) => {
		if (!containerRef.current || !topSpaceRef.current || !bottomSpaceRef.current) return

		const scrollPos = e.currentTarget.scrollTop
		const bottomEdge = scrollPos + containerRef.current.clientHeight
		
		if (
			scrollPos - state.visibleHeight < topSpaceRef.current.clientHeight ||
			bottomEdge + state.visibleHeight > bottomSpaceRef.current.offsetTop
		) {
			const avgHeight = getAverageItemHeight(containerRef.current)
			const itemsPerScreen = Math.floor(state.visibleHeight / avgHeight)
			const firstChildVisible = Math.floor(scrollPos / avgHeight)
			console.log(
				// scrollPos,
				// bottomEdge,
				// topSpaceRef.current.clientHeight,
				// bottomSpaceRef.current.offsetTop,
{				avgHeight,
				visHeight: state.visibleHeight,
				itemsPerScreen,
				firstChildVisible}
			)
			console.log("jump")
			
			state.firstIndex =
				Math.max(0, firstChildVisible - itemsPerScreen * 2)
			state.lastIndex = firstChildVisible + itemsPerScreen * 3
		}
	}, [state])

	// useEffect(() => {
	// 	const observer = new IntersectionObserver(
	// 		(entries) => {
	// 			for (const e of entries) {
	// 				if (e.target === bottomSpaceRef.current && e.isIntersecting) {
	// 					// bottom spacer is a screen height away from the sreen
	// 					const itemsPerScreen = Math.floor(snap.visibleHeight / getAverageItemHeight(containerRef.current))
	// 					state.lastIndex = Math.min(items.length, state.lastIndex + itemsPerScreen)
	// 					state.firstIndex = Math.max(0, state.lastIndex - itemsPerScreen * 4)
	// 				}
	// 				if (e.target === topSpaceRef.current && e.isIntersecting) {
	// 					const itemsPerScreen = Math.floor(snap.visibleHeight / getAverageItemHeight(containerRef.current))
	// 					state.firstIndex = Math.max(0, state.firstIndex - itemsPerScreen)
	// 					state.lastIndex = state.firstIndex + itemsPerScreen * 4
	// 				}
	// 			}
	// 		},
	// 		{ rootMargin: `${snap.visibleHeight}px 0px`, root: containerRef.current },
	// 	) // preload ahead

	// 	if (topSpaceRef.current) observer.observe(topSpaceRef.current)
	// 	if (bottomSpaceRef.current) observer.observe(bottomSpaceRef.current)

	// 	return () => observer.disconnect()
	// }, [items.length, state, snap.visibleHeight])

	useEffect(() => {
		if (!containerRef.current) return
		const ro = new ResizeObserver(() => {
			if (!containerRef.current) return
			state.visibleHeight = containerRef.current.clientHeight
		})
		ro.observe(containerRef.current)

		return () => ro.disconnect()
	}, [state])

	const itemSize = getAverageItemHeight(containerRef.current) ?? 1
	const topSpace = `${itemSize * state.firstIndex}px` //`calc(${itemSize} * ${state.firstIndex})`
	const bottomSpace = `${itemSize * (items.length - state.lastIndex)}px` //`calc(${itemSize} * ${items.length - state.lastIndex})`
	// console.log("render", renderCount++)
	return (
		<Container
			ref={containerRef}
			position={"relative"}
			onScroll={(e) => handleScroll(e)}
			{...restProps}
		>
			<Content gridTemplateRows={`repeat(${items.length}, 1fr)`} height={`${itemSize * items.length}px`}>
				<Box ref={topSpaceRef} gridRowStart={1} gridRowEnd={snap.firstIndex} display={snap.firstIndex > 0 ? "block" : "none"} />
				{items.slice(snap.firstIndex, snap.lastIndex).map((item, i) => (
					<Item
						index={i + snap.firstIndex}
						gridRow={i + snap.firstIndex + 1}
						value={item}
						key={keyFn?.(item) ?? i}
					/>
				))}
				<div
					ref={bottomSpaceRef}
					style={{
						gridRowStart: snap.lastIndex + 2,
						gridRowEnd: items.length,
					}}
				/>
			</Content>
			{createPortal(
				<Box position={"absolute"} bottom={2} right={2} whiteSpace={"pre-"}>
					Items: {items.length} <br />
					Current Item: {snap.currentItem} <br />
					Updates: {snap.updates} <br />
					Rendered: {snap.firstIndex} to {snap.lastIndex} <br />
					Height: {snap.visibleHeight}
				</Box>,
				document.getElementById("root"),
			)}
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
		gap: 0
	},
})

type DerefRefType<T = Record<string, RefObject<unknown>>> = {
	[K in keyof T]: T[K] extends RefObject<infer V> ? V : never
}

export default VirtualizedList

function countVisibleItems(container: HTMLDivElement | null) {
	if (!container) return

	const content = container.firstChild as HTMLDivElement
	if (!content) return

	const top = container.scrollTop
	const bottom = top + container.clientHeight

	let visible = 0

	for (const child of content.childNodes as Iterable<HTMLElement>) {
		if (child.offsetTop < bottom && child.offsetTop + child.clientHeight > top) {
			visible++
		}
	}

	return visible
}

function getAverageItemHeight(container: HTMLDivElement | null) {
	if (!container) return 1

	const content = container.firstChild as HTMLDivElement
	if (!content || content.childNodes.length <= 2) return 1

	let total = 0
	let count = 0

	for (const child of content.childNodes as Iterable<HTMLElement>) {
		count += 1
		// skip the spacers
		if (count === 1 || count === content.childNodes.length) continue

		total += child.clientHeight
	}

	return total / count
}
