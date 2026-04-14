import { Box, SimpleGrid, type SimpleGridProps } from "@chakra-ui/react"
import { type PropsWithChildren, useRef } from "react"
import { MeasureGroupContext } from "@/components/measureGrid/useMeasureGrid"

export interface MeasureGridProps extends SimpleGridProps {
    columns?: number
    maxItemLines?: number
}

export function MeasureGrid(props: PropsWithChildren<MeasureGridProps>) {
    const { columns = 1, children, maxItemLines = 4, ...restProps } = props

    const sizerRef = useRef<HTMLDivElement>(null)

    const cv = useRef({
        columns,
        gap: 8,
        maxItemLines,
        sizerRef,
    })

    return (
        <MeasureGroupContext value={cv.current}>
            <SimpleGrid as={"dl"} columns={columns} overflowY={"hidden"} {...restProps}>
                <Box
                    width={"100%"}
                    height={0}
                    gridColumn={`1 / span ${columns}`}
                    overflow={"hidden"}
                    position={"relative"}
                    visibility={"hidden"}
                >
                    <Box
                        position={"absolute"}
                        whiteSpace={"pre-wrap"}
                        ref={sizerRef}
                        padding={0.5}
                    />
                </Box>
                {children}
            </SimpleGrid>
        </MeasureGroupContext>
    )
}

export default MeasureGrid
