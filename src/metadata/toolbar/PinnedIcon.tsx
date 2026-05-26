import { motion } from "motion/react"
import { useEffect, useState } from "react"

const PinnedIcon = ({ pin }: { pin?: number | null }) => {
    const [isPinnedDisplay, setIsPinnedDisplay] = useState(false)

    useEffect(() => {
        if (pin === undefined) return
        setIsPinnedDisplay(pin !== null)
    }, [pin])

    return (
        <motion.svg
            width="1em"
            height="1em"
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            animate={isPinnedDisplay ? "pinned" : "unpinned"}
            initial={isPinnedDisplay ? "pinned" : "unpinned"}
        >
            {/* <rect x="0" y="0" width="200" height="200" stroke={"red"} strokeWidth={10} /> */}
            <g>
                <motion.g
                    // transform="translate(20.354 33.361)"
                    variants={{
                        pinned: {
                            rotate: 0,
                            scale: 1.1,
                            x: 30,
                            y: 40,
                        },
                        unpinned: {
                            rotate: 45,
                            scale: 0.9,
                            x: 20,
                            y: 10,
                        },
                    }}
                    transition={{ duration: 0.1 }}
                >
                    <path
                        d="M127.923 6.10352e-05L111.281 6.10352e-05L31.427 0L14.7855 0L14.7855 17L31.427 17L31.427 79.3885C26.7625 82.8089 22.1701 87.2347 17.65 92.6658C5.88328 106.804 -4.1008e-05 122.747 0 140.493L0 148.993L142.708 148.993L142.708 140.493C142.708 122.728 136.813 106.772 125.024 92.6255C120.505 87.2027 115.924 82.7894 111.281 79.3857L111.281 17.0001L127.923 17.0001L127.923 6.10352e-05L127.923 6.10352e-05ZM48.427 88.7375L48.427 17.0001L94.2809 17.0001L94.2809 88.7375L98.4077 91.2136C102.822 93.8623 107.341 97.9607 111.965 103.509C119.186 112.175 123.562 121.67 125.092 131.993L17.6164 131.993C19.1439 121.683 23.5107 112.199 30.7166 103.541C35.3318 97.9953 39.8597 93.8863 44.3002 91.2135L44.3082 91.2087L48.427 88.7375L48.427 88.7375Z"
                        fill="currentColor"
                    />
                    <motion.line
                        // x1={"100"}
                        // y1={"190"}
                        // x2={"100"}
                        // y2={"100"}
                        stroke="currentColor"
                        strokeWidth={18}
                        variants={{
                            pinned: {
                                x1: 100,
                                y1: 120,
                                x2: 100,
                                y2: 120,
                                // rotate: 0
                            },
                            unpinned: {
                                x1: 100,
                                y1: 120,
                                x2: 100,
                                y2: 200,
                                // rotate: 45,
                            },
                        }}
                        style={{ x: -25, y: 12 }}
                        transition={{ duration: 0.1 }}
                    />
                </motion.g>
            </g>
        </motion.svg>
    )

    // return <UnPinned />
}

export default PinnedIcon
