import { motion } from "motion/react"
import { CheckRoot, Panel } from "@/components"
import { ColorMode, useColorMode } from "@/components/ui/color-mode"
import { Icon } from "@chakra-ui/react"
import { ComponentProps } from "react"

function Empty() {
    return (
        <CheckRoot width={"full"} height={"full"} padding={8}>
            <Panel width={"full"} height={"full"} justifyContent={"center"} alignItems={"center"}>
                <UpgradeIcon width={"50%"} height={"50%"} bgColor={"gray"} />
            </Panel>
        </CheckRoot>
    )
}
const ball = `
    M         -8 -20 
    Q -18 -22 -26  -10 
    Q -34  0 -26  10 
    Q -18  22 -8  20 
    Q  2   22  10   10 
    Q  18  0  10   -10 
    Q  2  -22 -8 -20 Z`
const UpgradeIcon = (props: ComponentProps<typeof Icon>) => {
    const { colorMode } = useColorMode()

    return (
        <Icon {...props} asChild>
            <motion.svg
                viewBox="0 0 200 200"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                animate={{
                    y: [0, 0, 1, -2, 1, -2, 0],
                }}
                transition={{
                    duration: 5,
                    times: [0, 0.5, 0.7, 0.725, 0.8, 0.825, 1],
                    repeat: Infinity,
                    repeatType: "loop",
                    ease: "easeOut",
                    delay: 0.7,
                }}
                whileHover={{ y: 0 }}
            >
                <g>
                    <rect
                        x={0}
                        y={0}
                        width={200}
                        height={200}
                        fill={colorMode === "light" ? "#bbb" : "#666"}
                    />
                </g>
                <motion.g>
                    <UpgradePath
                        i={2}
                        colorMode={colorMode}
                        d={getPath(180, 60, 40)}
                        d2={ball}
                        tx={[10, 100]}
                        ty={[20, 50]}
                    />
                    <UpgradePath
                        i={1}
                        colorMode={colorMode}
                        d={getPath(140, 50, 35)}
                        d2={ball}
                        tx={[30, 170]}
                        ty={[70, 150]}
                    />
                    <UpgradePath
                        i={0}
                        colorMode={colorMode}
                        d={getPath(100, 40, 30)}
                        d2={ball}
                        tx={[50, 50]}
                        ty={[115, 150]}
                    />
                </motion.g>
            </motion.svg>
        </Icon>
    )
}

const UpgradePath = ({
    d,
    d2,
    tx,
    ty,
    i,
    colorMode,
}: {
    d: string
    d2: string
    tx: [number, number]
    ty: [number, number]
    i: number
    colorMode: ColorMode
}) => {
    const colorDuration = 5
    const fg = colorMode === "light" ? "#565e67" : "#8e97a2"
    const fgb = colorMode === "light" ? "#476d53ff" : "#66a676ff"
    return (
        <motion.path
            // d={d}
            animate={{
                fill: [fgb, fg, "#83ff67ff", fgb],
                // scale: [1, 1.1, 1.2, 1],
                d: [d, d, d2, d2],
                x: [tx[0], tx[0], tx[1], tx[1]],
                y: [ty[0], ty[0], ty[1], ty[1]],
            }}
            transition={{
                duration: colorDuration,
                times: [0, 0.25, 0.5, 0.75],
                // ease: ["easeOut", "linear", "linear"],
                repeat: Infinity,
                repeatType: "loop",
                // delay: 0.1 * i,
            }}
            stroke-width="0"
            stroke="#000000"
            // style={{ x: tx, y: ty * 1.3 }}
        />
    )
}

export default Empty

type Ts = (x: number, y: number) => [number, number]
type P = [number, number]
function getPath(width = 180, steep = 100, thickness = 40) {
    const height = steep + thickness
    const p = ([x, y]: P) => `${x} ${y}`
    const q = ([cx, cy]: P, [x, y]: P) => `Q ${cx} ${cy} ${x} ${y}`
    const mid = ([x1, y1]: P, [x2, y2]: P): P => [(x1 + x2) / 2, (y1 + y2) / 2]
    const ts: P[] = [
        [width / 2, 0],
        [0, height - thickness],
        [0, height],
        [width / 2, thickness],
        [width, height],
        [width, height - thickness],
        [width / 2, 0],
    ]
    const output = [`M ${p(ts[0])}`]

    for (let i = 1; i < 7; i++) {
        const prev = ts[i - 1]
        const curr = ts[i]
        output.push(q(mid(prev, curr), curr))
    }

    output.push("Z")

    return output.join(" ")
}
