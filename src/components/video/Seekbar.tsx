import { Box } from "@chakra-ui/react"
import { motion, useMotionValue } from "motion/react"
import { useRef } from "react"
import { useVideoContext } from "./context"

interface SeekbarProps extends ChakraProps {}

function Seekbar(props: SeekbarProps) {
    const { ...restProps } = props

    const trackRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const pointerDownRef = useRef(false)

    const hoverPos = useMotionValue(0)

    const { controls } = useVideoContext()

    return (
        <Box
            ref={containerRef}
            position={"relative"}
            height={"2rem"}
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
                const pos = Math.max(0, Math.min(1, x / rect.width))
                controls.pause()
                controls.seek(pos, true)
            }}
            onPointerUpCapture={(e) => {
                if (!pointerDownRef.current) return
                e.stopPropagation()
                pointerDownRef.current = false
                controls.endSeek(false)
            }}
            onPointerMove={(e) => {
                if (!pointerDownRef.current) return
                e.stopPropagation()
                const rect = trackRef.current?.getBoundingClientRect()
                if (!rect) return
                const x = e.clientX - rect.left
                const pos = Math.max(0, Math.min(1, x / rect.width))
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
                    height: "0.25rem",
                    backgroundColor: "var(--chakra-colors-grays-8)",
                    scaleX: controls.posMv,
                    transformOrigin: "left",
                }}
            />
        </Box>
    )
}

export default Seekbar
