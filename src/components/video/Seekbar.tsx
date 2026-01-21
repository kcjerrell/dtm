import { Box } from "@chakra-ui/react"
import { motion, useMotionValue } from "motion/react"
import { useRef } from "react"
import { useVideoContext } from "./context"

interface SeekbarProps extends ChakraProps {}

function Seekbar(props: SeekbarProps) {
    const { ...restProps } = props

    const trackRef = useRef<HTMLDivElement>(null)
    
    const { controls, nFrames } = useVideoContext()

    const pointerDownRef = useRef(false)

    // const thumbX = useTransform(controls.frameMv, (frame) => frame * (trackRef.current?.offsetWidth ?? 0))

    const hoverPos = useMotionValue(0)

    return (
        <Box
            position={"relative"}
            height={"2rem"}
            // bgColor={"bg.1/20"}
            width={"100%"}
            color={"fg.1"}
            onMouseMove={(e) => {
                const rect = trackRef.current?.getBoundingClientRect()
                if (!rect) return
                hoverPos.set(e.clientX - rect.left)
            }}
            onPointerDown={(e) => {
                e.stopPropagation()
                pointerDownRef.current = true
                e.currentTarget.setPointerCapture(e.pointerId)
                const rect = trackRef.current?.getBoundingClientRect()
                if (!rect) return
                const x = e.clientX - rect.left
                const pos = x / (rect.width)
                controls.pause()
                controls.seek(pos)
            }}
            onPointerUp={(e) => {
                e.stopPropagation()
                pointerDownRef.current = false
            }}
            onPointerMove={(e) => {
                e.stopPropagation()
                if (!pointerDownRef.current) return
                const rect = trackRef.current?.getBoundingClientRect()
                if (!rect) return
                const x = e.clientX - rect.left
                const pos = x / (rect.width)
                controls.seek(pos)
            }}
            {...restProps}
        >
            <Box
                ref={trackRef}
                position={"absolute"}
                top={"50%"}
                left={0}
                right={0}
                transform={"translateY(-50%)"}
                height={"0.25rem"}
                bgColor={"grays.5"}
            />
            <motion.div
                style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: "50%",
                    y: "-50%",
                    // width: "1rem",
                    height: "0.25rem",
                    // borderRadius: "50%",
                    backgroundColor: "var(--chakra-colors-grays-8)",
                    scaleX: controls.posMv,
                    transformOrigin: "left",
                }}
            />
            {/* <motion.div
                style={{
                    position: "absolute",
                    left: "-0.5rem",
                    width: "0.25rem",
                    height: "1rem",
                    borderRadius: "50%",
                    backgroundColor: "var(--chakra-colors-highlight)",
                    x: hoverPos,
                    overflow: "visible",
                }}
            >
                <Box
                    position={"absolute"}
                    width={"max-content"}
                    transform={"translate(-50%, 100%)"}
                    color={"white"}
                >
                    Hello
                </Box>
            </motion.div> */}
        </Box>
    )
}

export default Seekbar
