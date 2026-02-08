/// <reference path="../../global.d.ts" />
import { Box, type BoxProps, chakra, Grid } from "@chakra-ui/react"
import {
    type ComponentType,
    type ReactNode,
    type UIEvent,
    useCallback,
    useEffect,
    useRef,
} from "react"
import { proxy, useSnapshot } from "valtio"
import type { ContainerEvent } from "@/utils/container/StateController"
import type { IItemSource } from "./PagedItemSource"

export interface PVGridProps<T = unknown, P = unknown> extends ChakraProps {
    itemComponent: PVGridItemComponent<T, P>
    /** number of screens */
    overscan?: number
    keyFn?: (
        item: T | null | undefined,
        index: number | null | undefined,
    ) => string | number | undefined | null
    initialRowCount?: number
    itemProps?: P
    maxItemSize: number
    onImagesChanged?: ContainerEvent<"imagesChanged">
    freeze?: boolean
    itemSource: IItemSource<T>
}

export type PVGridItemComponent<T = unknown, P = unknown> = ComponentType<PVGridItemProps<T, P>>

interface PVGridItemPropsBase<T = unknown> extends ChakraProps {
    value: T | null | undefined
    index: number
}

export type PVGridItemProps<T = unknown, P = unknown> = PVGridItemPropsBase<T> & P

type StateProxy = {
    minThreshold: number
    maxThreshold: number
    firstRow: number
    // lastRow: number
    visibleHeight: number
    columns: number
    rowHeight: number
    rowPos: number
}

function PVGridWrapper<T = unknown, P = unknown>(props: Partial<PVGridProps<T, P>>) {
    const { itemComponent, itemSource, maxItemSize, freeze, ...restProps } = props

    const lastRenderRef = useRef<ReactNode>(null)

    if (!itemSource || !maxItemSize || !itemComponent) {
        return <Box {...(restProps as BoxProps)} />
    }

    if (freeze) {
        return lastRenderRef.current
    }

    lastRenderRef.current = (
        <PVGrid<T, P>
            itemComponent={itemComponent}
            maxItemSize={maxItemSize}
            itemSource={itemSource}
            {...restProps}
        />
    )

    return lastRenderRef.current
}

function PVGrid<T = unknown, P = unknown>(props: PVGridProps<T, P>) {
    const {
        itemComponent,
        itemSource,
        keyFn,
        initialRowCount = 10,
        overscan = 2,
        itemProps,
        maxItemSize,
        onImagesChanged,
        onScroll,
        ...restProps
    } = props
    const Item = itemComponent
    const { renderItems, totalCount, hasInitialLoad } = itemSource.useItemSource()

    const stateRef = useRef<StateProxy>(null)
    if (stateRef.current === null) {
        stateRef.current = proxy({
            minThreshold: 0,
            firstRow: 0,
            // lastRow: initialRowCount,
            maxThreshold: 0,
            visibleHeight: 1,
            columns: 1,
            rowHeight: 1,
            rowPos: 0,
        })
    }
    const state = stateRef.current as StateProxy
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

        let lastRow = firstVisibleRow + rowsOnScreen + rowsOnScreen * overscan
        lastRow = Math.min(Math.ceil(lastRow), Math.ceil(totalCount / columns))

        state.minThreshold = (state.firstRow * rowHeight + scrollContainer.scrollTop) / 2
        state.maxThreshold = (lastRow * rowHeight + scrollContainer.scrollTop) / 2

        itemSource.renderWindow = [state.firstRow * columns, lastRow * columns]
    }, [state, overscan, maxItemSize, totalCount, itemSource])

    const handleScroll = useCallback(
        (e: UIEvent<HTMLDivElement>) => {
            if (!scrollContainerRef.current) return
            state.rowPos = scrollContainerRef.current.scrollTop / state.rowHeight
            if (
                Math.max(0, e.currentTarget.scrollTop) < state.minThreshold ||
                Math.min(
                    e.currentTarget.scrollTop,
                    e.currentTarget.scrollHeight - e.currentTarget.clientHeight,
                ) > state.maxThreshold
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
            itemSource.clearItems()
        }
        onImagesChanged?.on(handler)
        return () => {
            onImagesChanged?.off(handler)
        }
    }, [onImagesChanged, itemSource])

    useEffect(() => {
        if (!scrollContainerRef.current?.parentElement) return
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.target !== scrollContainerRef.current?.parentElement) continue
                state.visibleHeight = scrollContainerRef.current?.parentElement?.clientHeight ?? 0
                const itemPos = state.rowPos * state.columns
                recalculate()
                const rowPos = itemPos / state.columns
                scrollContainerRef.current.scrollTo({
                    top: rowPos * state.rowHeight,
                    behavior: "instant",
                })
            }
        })
        ro.observe(scrollContainerRef.current.parentElement)

        return () => ro.disconnect()
    }, [state, recalculate])

    return (
        <Container
            ref={scrollContainerRef}
            position={"relative"}
            onScroll={(e) => {
                handleScroll(e)
                onScroll?.(e)
            }}
            {...restProps}
        >
            <Grid
                role={"grid"}
                aria-label={"Image grid"}
                data-testid={"image-grid"}
                aria-busy={hasInitialLoad ? "false" : "true"}
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
                <PVGridItems<T, P>
                    items={renderItems as T[]}
                    indexOffset={snap.firstRow * snap.columns}
                    component={itemComponent}
                    itemProps={{ ...itemProps } as P}
                    keyFn={keyFn}
                />
            </Grid>
        </Container>
    )
}

function PVGridItems<T, P>(props: {
    items: T[]
    indexOffset: number
    component: PVGridItemComponent<T, P>
    itemProps: P
    keyFn: PVGridProps<T, P>["keyFn"]
}) {
    const { items, indexOffset, component, itemProps, keyFn } = props
    const Item = component
    return (
        <>
            {items.map((item, i) => {
                const index = i + indexOffset
                return (
                    <Item
                        // gridRow={`${Math.floor(index / columns) + 1}`}
                        // gridColumn={`${(index % columns) + 1}`}
                        index={index}
                        value={item as T}
                        key={item ? keyFn?.(item as T, index) : index}
                        {...(itemProps as P)}
                    />
                )
            })}
        </>
    )
}

const Container = chakra(
    "div",
    {
        base: {
            overflowY: "auto",
            overflowX: "visible",
            scrollBehavior: "smooth",
            overscrollBehavior: "contain",
            maxHeight: "100%",
            _scrollbarTrack: {
                backgroundColor: "bg.deep/50",
            },
        },
    },
    { defaultProps: { className: "panel-scroll" } },
)

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
}
