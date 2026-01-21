import { Fragment } from "react/jsx-runtime"
import { CheckRoot, Panel } from "@/components"

const topEdge = 35
const bottomEdge = 165
const width = 220
const height = 200
const thickness = 12

function Empty() {
    return (
        <CheckRoot width={"full"} height={"full"} padding={8}>
            <Panel width={"full"} height={"full"} justifyContent={"center"} alignItems={"center"}>
                <svg
                    width={"2rem"}
                    height={"2rem"}
                    viewBox={`-10 -10 ${width + 20} ${height + 20}`}
                >
                    <rect
                        x={0}
                        y={0}
                        width={width}
                        height={height}
                        stroke={"currentColor"}
                        strokeWidth={thickness}
                        fill={"none"}
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
                        style={{
                            fontSize: `${bottomEdge - topEdge - thickness}px`,
                            fontWeight: "500",
                        }}
                    >
                        81
                    </text>
                </svg>
            </Panel>
        </CheckRoot>
    )
}

export default Empty
