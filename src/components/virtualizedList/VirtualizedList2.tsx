import { Box, chakra } from "@chakra-ui/react"
import { type JSX, useCallback, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { proxy, useSnapshot } from "valtio"
import { proxyMap } from "valtio/utils"

interface VirtualizedListProps<T> extends ChakraProps {
	overscan?: number
	itemComponent: (props: VirtualizedListItemProps<T>) => JSX.Element
	items: T[] | Readonly<T[]>
	keyFn?: (item: T) => string | number
	estimatedItemSize: number
	initialRenderCount?: number
  itemProps?: unknown
}

export interface VirtualizedListItemProps<T> extends Record<string, unknown> {
  value?: T
  index?: number
  itemProps?: unknown
}

type StateProxy = {
	currentItem: number
	updates: number
	firstIndex: number
	lastIndex: number
	visibleHeight: number
	expanded: ReturnType<typeof proxyMap<number, number>>
}
let renders = 0
export default function VirtualizedList<T>(props: VirtualizedListProps<T>) {
	const {
		itemComponent: Item,
		items,
		keyFn,
		estimatedItemSize,
		initialRenderCount = 20,
		overscan = 5,
    itemProps,
		...restProps
	} = props

	const stateRef = useRef<StateProxy>(null)
	if (!stateRef.current) {
		stateRef.current = proxy({
			currentItem: 0,
			updates: 0,
			firstIndex: 0,
			lastIndex: initialRenderCount,
			visibleHeight: 1,
			expanded: proxyMap<number, number>(),
		})
	}
	const state = stateRef.current
	const snap = useSnapshot(state)

	const containerRef = useRef<HTMLDivElement>(null)
	const heights = useRef(new Map<number, number>()) // <---- new height map

	// safe cumulative offset calculator
	const getOffsetBefore = useCallback(
		(index: number) => {
			if (!Number.isFinite(index) || index <= 0) return 0
			index = Math.min(index, items.length)

			let sum = 0
			for (let i = 0; i < index; i++) {
				const h = heights.current.get(i)
				// ensure numeric fallback
				const safe = typeof h === "number" && h > 0 && Number.isFinite(h) ? h : estimatedItemSize
				sum += safe
			}
			return sum
		},
		[items.length, estimatedItemSize],
	)

	// compute which items should be visible based on scroll position
	const CHUNK_SIZE = 10

	const recomputeVisibleRange = useCallback(() => {
		const container = containerRef.current
		if (!container) return

		const scrollTop = container.scrollTop
		const viewHeight = container.clientHeight

		// find rough starting index
		let start = 0
		let offset = 0
		while (
			start < items.length &&
			offset + (heights.current.get(start) ?? estimatedItemSize) < scrollTop
		) {
			offset += heights.current.get(start) ?? estimatedItemSize
			start++
		}

		let end = start
		let heightSoFar = 0
		while (
			end < items.length &&
			heightSoFar < viewHeight * 2 // overscan
		) {
			heightSoFar += heights.current.get(end) ?? estimatedItemSize
			end++
		}

		// snap to chunk boundaries
		const chunkStart = Math.floor(start / CHUNK_SIZE) * CHUNK_SIZE
		const chunkEnd = Math.ceil(end / CHUNK_SIZE) * CHUNK_SIZE

		const nextFirst = Math.max(0, chunkStart - overscan)
		const nextLast = Math.min(items.length, chunkEnd + overscan)

		// only update if changed (prevents useless renders)
		if (nextFirst !== state.firstIndex || nextLast !== state.lastIndex) {
			state.firstIndex = nextFirst
			state.lastIndex = nextLast
			state.updates++
		}
	}, [items.length, estimatedItemSize, overscan, state])

	// handle scroll event
	const handleScroll = useCallback(() => {
		recomputeVisibleRange()
	}, [recomputeVisibleRange])

	// handle resize of container
	useEffect(() => {
		if (!containerRef.current) return
		const ro = new ResizeObserver(() => {
			if (!containerRef.current) return
			state.visibleHeight = containerRef.current.clientHeight
			recomputeVisibleRange()
		})
		ro.observe(containerRef.current)
		return () => ro.disconnect()
	}, [state, recomputeVisibleRange])

	// measure each item dynamically
	const registerItem = useCallback(
		(index: number, el: HTMLDivElement | null) => {
			if (!el) return
			let lastHeight = 0

			const measure = () => {
				const h = el.offsetHeight
				if (h > 0 && h !== lastHeight) {
					lastHeight = h
					heights.current.set(index, h)
					// defer recompute to next frame to avoid ResizeObserver loop warnings
					requestAnimationFrame(() => recomputeVisibleRange())
				}
			}

			const ro = new ResizeObserver(measure)
			ro.observe(el)
			measure()
			return () => ro.disconnect()
		},
		[recomputeVisibleRange],
	)

	const safeIndex = (n: number) => Math.max(0, Math.min(items.length, n))

	const totalHeight = getOffsetBefore(items.length)
	const topSpacerHeight = getOffsetBefore(safeIndex(snap.firstIndex))
	const bottomSpacerHeight = Math.max(0, totalHeight - getOffsetBefore(safeIndex(snap.lastIndex)))

	if (!Number.isFinite(topSpacerHeight) || !Number.isFinite(bottomSpacerHeight)) {
		console.warn("Spacer NaN detected", {
			topSpacerHeight,
			bottomSpacerHeight,
			snap,
			totalHeight,
		})
	}

	return (
		<Container ref={containerRef} onScroll={handleScroll} {...restProps}>
			<Content>
				<Box height={`${topSpacerHeight}px`} />

				{items.slice(snap.firstIndex, snap.lastIndex).map((item, i) => {
					const index = i + snap.firstIndex
					return (
						<div key={keyFn?.(item) ?? index} ref={(el) => registerItem(index, el)}>
							<Item value={item} index={index} itemProps={itemProps}/>
						</div>
					)
				})}

				<Box height={`${bottomSpacerHeight}px`} />
			</Content>

			{createPortal(
				<Box position="absolute" bottom={2} right={2} whiteSpace="pre">
					Items: {items.length}
					{"\n"}
					Current: {snap.currentItem}
					{"\n"}
					Rendered: {snap.firstIndex}–{snap.lastIndex}
					{"\n"}
					Visible H: {snap.visibleHeight}
          {"\n"}
          Renders: {renders++}
				</Box>,
				document.getElementById("root")!,
			)}
		</Container>
	)
}

// Chakra wrappers
const Container = chakra("div", {
	base: { overflowY: "auto", position: "relative", height: "100%" },
})

const Content = chakra("div", {
	base: {
		display: "grid",
		gridTemplateColumns: "1fr",
		alignItems: "stretch",
		justifyItems: "stretch",
		minHeight: "100%",
	},
})
