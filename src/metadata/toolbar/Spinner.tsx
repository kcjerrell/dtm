import { Icon } from "@chakra-ui/react"
import { motion } from "motion/react"
import type { ComponentProps } from "react"

function Spinner(props: ComponentProps<typeof Icon>) {
    return (
        <Icon {...props}>
            <motion.svg viewBox="-100 -100 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* <ellipse cx="100" cy="100" rx="100" ry="100" fill="white" /> */}
                <defs>
                    <linearGradient
                        id={"gradient_1"}
                        gradientUnits="userSpaceOnUse"
                        x1="74.5"
                        y1="0"
                        x2="74.5"
                        y2="149"
                    >
                        <stop offset="0" stopColor="#FF0000" />
                        <stop offset="1" stopColor="#808080" />
                    </linearGradient>
                </defs>
                <g>
                    {/* <path d="M0 74.5C0 33.3548 36.75 0 74 0C111.25 0 149 33.3548 149 74.5C149 115.645 115.645 149 74.5 149" /> */}
                    {/* <path
					d="M74.5 149L74.5 148Q104.945 148 126.472 126.472Q148 104.945 148 74.5Q148 44.7573 124.778 22.5432Q114.202 12.4271 101.039 6.77341Q87.5969 1 74 0.999992Q60.4157 1 47.1209 6.77185Q34.1226 12.4149 23.7289 22.537Q1 44.6719 1 74.5L0 74.5C0 33.3548 36.75 0 74 0C111.25 0 149 33.3548 149 74.5C149 115.645 115.645 149 74.5 149Z"
					fill="none"
					fill-rule="evenodd"
					stroke="url(#gradient_1)"
					stroke-width="5"
				/> */}
                    {Array.from({ length: 8 }).map((_, i, arr) => {
                        const n = arr.length
                        const x1 = Math.cos((2 * Math.PI * i) / n) * 70
                        const y1 = Math.sin((2 * Math.PI * i) / n) * 70

                        return (
                            <motion.ellipse
                                // biome-ignore lint/suspicious/noArrayIndexKey: range id
                                key={i}
                                cx={x1}
                                cy={y1}
                                style={{
                                    rotate: (i / n) * 360,
                                    fill: "#51ac35",
                                }}
                                initial={{ rx: 0, ry: 0 }}
                                animate={{
                                    rx: [0, 30, 0],
                                    ry: [0, 30, 0],
                                    fill: ["#51ac3500", "#51ac35ff", "#51ac3500"],
                                }}
                                transition={{
                                    delay: i / n,
                                    duration: 1,
                                    times: [0, 0.1, 1],
                                    // ease: ['circOut', 'circOut',],
                                    repeat: Infinity,
                                    repeatType: "loop",
                                }}
                            />
                        )
                    })}
                </g>
            </motion.svg>
        </Icon>
    )
}

export default Spinner
