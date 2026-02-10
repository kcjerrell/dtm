import { Box, chakra } from "@chakra-ui/react"
import { Fragment } from "react/jsx-runtime"

const topEdge = 35
const bottomEdge = 165
const width = 220
const height = 200
const THICKNESS = 15

interface FrameCountIndicatorProps extends ChakraProps {
    count?: React.ReactNode
    bgColor?: string
    thickness?: number
}

function FrameCountIndicator(props: FrameCountIndicatorProps) {
    const { count, bgColor, thickness = THICKNESS, ...restProps } = props
    const margin = thickness / 2 + 5

    return (
        <Box {...restProps}>
            <svg viewBox={`-${margin} -${margin} ${width + margin * 2} ${height + margin * 2}`}>
                <chakra.rect
                    x={0}
                    y={0}
                    width={width}
                    height={height}
                    stroke={"currentColor"}
                    strokeWidth={thickness}
                    fill={bgColor}
                    rx={20}
                    ry={20}
                />
                <line
                    x1={0}
                    y1={topEdge}
                    x2={width}
                    y2={topEdge}
                    stroke={"currentColor"}
                    strokeWidth={thickness}
                />
                <line
                    x1={0}
                    y1={bottomEdge}
                    x2={width}
                    y2={bottomEdge}
                    stroke={"currentColor"}
                    strokeWidth={thickness}
                />

                {Array.from({ length: 4 }).map((_, i) => (
                    <Fragment key={i}>
                        <line
                            x1={(i * width) / 4}
                            y1={0}
                            x2={(i * width) / 4}
                            y2={topEdge}
                            stroke={"currentColor"}
                            strokeWidth={thickness}
                        />
                        <line
                            x1={(i * width) / 4}
                            y1={bottomEdge}
                            x2={(i * width) / 4}
                            y2={height}
                            stroke={"currentColor"}
                            strokeWidth={thickness}
                        />
                    </Fragment>
                ))}
                <text
                    x={width / 2}
                    y={height / 2}
                    fill={"currentColor"}
                    textAnchor={"middle"}
                    dy={"0.35em"}
                    // dominantBaseline={"central"}
                    style={{ fontSize: `${bottomEdge - topEdge - thickness}px`, fontWeight: "600" }}
                >
                    {count}
                </text>
            </svg>
        </Box>
    )
}

export default FrameCountIndicator
