import { chakra, Spinner } from "@chakra-ui/react"
import { type ComponentProps, Fragment, useRef } from "react"
import type { TensorDataRow } from "@/commands"
import urls from "@/commands/urls"
import { showStackPreview } from "@/components/preview"
import { useThresholdDelay } from "@/hooks/useDecay"
import { useProxyRef } from "@/hooks/valtioHooks"
import { useDTP } from "../state/context"
import type { CanvasStack } from "../types"
import { DetailsImageContainer, DetailsImageContent, DetailsSpinnerRoot } from "./common"

interface CanvasStackComponentProps extends ComponentProps<typeof DetailsImageContainer> {
    stack: MaybeReadonly<CanvasStack>
}

const Rect = chakra("rect")

function CanvasStackComponent(props: CanvasStackComponentProps) {
    const { stack, ...restProps } = props

    const { uiState } = useDTP()
    const uiSnap = uiState.useSnap()

    const { state, snap } = useProxyRef(() => ({
        isLoaded: stack.tensorData.map(() => false) as boolean[],
        hoveredLayer: null as number | null,
    }))

    const svgRef = useRef<SVGSVGElement>(null)

    const layers = stack.tensorData.map((td, index) => getLayer(td, stack.projectId, index))
    const bounds = getBounds(layers)

    const viewbox = `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`

    const wheelBump = useThresholdDelay({
        time: 200,
        threshold: 100,
        callback: () => showStackPreview(svgRef.current, stack, bounds.width, bounds.height),
    })

    return (
        <DetailsImageContainer {...restProps}>
            <DetailsImageContent
                data-solid="true"
                onClick={() => showStackPreview(svgRef.current, stack, bounds.width, bounds.height)}
                onWheel={(e) => {
                    if (e.deltaY < 0) wheelBump(0 - e.deltaY)
                }}
                asChild
                subitem
            >
                <svg ref={svgRef} viewBox={viewbox} width={bounds.width} height={bounds.height}>
                    {layers.map((layer) => {
                        const isLoaded = snap.isLoaded[layer.index]
                        return (
                            <Fragment key={layer.index}>
                                <Rect
                                    x={layer.x - 4}
                                    y={layer.y - 4}
                                    width={layer.w + 8}
                                    height={layer.h + 8}
                                    fill={isLoaded ? "#00000000" : "#77777777"}
                                />
                                <image
                                    onLoad={() => {
                                        state.isLoaded[layer.index] = true
                                    }}
                                    x={layer.x}
                                    y={layer.y}
                                    width={layer.w}
                                    height={layer.h}
                                    href={layer.url}
                                    display={isLoaded ? "block" : "none"}
                                    pointerEvents={"none"}
                                />
                                <Rect
                                    x={layer.x - 2}
                                    y={layer.y - 2}
                                    width={layer.w + 4}
                                    height={layer.h + 4}
                                    stroke={"gray"}
                                    strokeWidth={4}
                                    strokeDasharray={"20 20"}
                                    fill={"none"}
                                    display={
                                        uiSnap.detailsView.showCanvasOutlines ? "block" : "none"
                                    }
                                />
                            </Fragment>
                        )
                    })}
                </svg>
            </DetailsImageContent>
            {!snap.isLoaded.every((layer) => layer) && (
                <DetailsSpinnerRoot key={"subitem_spinner"} gridArea={"image"}>
                    <Spinner width={"100%"} height={"100%"} color={"white"} />
                </DetailsSpinnerRoot>
            )}
        </DetailsImageContainer>
    )
}

export function getBounds(layers: { x: number; y: number; w: number; h: number }[]) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const layer of layers) {
        minX = Math.min(minX, layer.x)
        minY = Math.min(minY, layer.y)
        maxX = Math.max(maxX, layer.x + layer.w)
        maxY = Math.max(maxY, layer.y + layer.h)
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

export function getLayer(td: MaybeReadonly<TensorDataRow>, projectId: number, index: number) {
    const scale = td.scale_factor_by_120 > 0 ? td.scale_factor_by_120 / 120 : 1
    return {
        x: td.x,
        y: td.y,
        w: td.width / scale,
        h: td.height / scale,
        index,
        url: urls.tensor(projectId, `tensor_history_${td.tensor_id}`),
        tensorData: td,
    }
}

export default CanvasStackComponent
