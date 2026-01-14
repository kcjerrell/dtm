import { Box, VStack, Text, Button } from "@chakra-ui/react"
import { UIControllerState } from "../state/uiState"
import { proxy, Snapshot, useSnapshot } from "valtio"
import { useEffect, useRef } from "react"
import { createVideoFromFrames, pdb, TensorHistoryNode } from "@/commands"
import { useMotionValue } from "motion/react"
import urls from "@/commands/urls"
import { useProxyRef } from "@/hooks/valtioHooks"

interface ClipProps extends ChakraProps {
    item: Snapshot<UIControllerState["detailsView"]["item"]>
    itemDetails: Snapshot<UIControllerState["detailsView"]["itemDetails"]>
}

function Clip(props: ClipProps) {
    const { item, itemDetails, ...restProps } = props

    const { state, snap } = useProxyRef(() => ({
        data: [] as TensorHistoryNode[],
        start: 0,
        videoPath: "what",
    }))

    const containerRef = useRef<HTMLDivElement>(null)
    const rafRef = useRef<number>(0)
    const frameRef = useRef<number>(0)

    useEffect(() => {
        return
        if (!item) return
        console.log(item)
        pdb.getClip(item.id).then((data) => {
            state.data = data
        })

        const animate = (time: DOMHighResTimeStamp) => {
            if (!containerRef.current || containerRef.current.children.length !== state.data.length)
                return
            const t = ((time - state.start) / 1000) * 24
            const frame = Math.floor(t) % state.data.length
            if (frame !== frameRef.current) {
                containerRef.current.children[frameRef.current]?.setAttribute(
                    "style",
                    "display: none",
                )
                frameRef.current = frame
                containerRef.current.children[frameRef.current]?.setAttribute(
                    "style",
                    "display: block",
                )
            }
            rafRef.current = requestAnimationFrame(animate)
        }

        rafRef.current = requestAnimationFrame((time) => {
            state.start = time
            animate(time)
        })

        return () => cancelAnimationFrame(rafRef.current)
    }, [item, state])

    return (
        <VStack
            position={"relative"}
            ref={containerRef}
            width={"full"}
            height={"full"}
            {...restProps}
        >
            <Button
                onClick={async () => {
                    state.videoPath = "hello"
                    const result = await createVideoFromFrames(item?.id)
                    console.log("path", result)
                    state.videoPath = result
                }}
            >
                Vid
            </Button>
            <Button
                onClick={() => {
                    console.log(state.videoPath)
                    state.videoPath = "lala"
                    console.log(state.videoPath)
                }}
            >
                Test
            </Button>
            <Box>Video: {snap.videoPath}</Box>
            {/* {snap.data
                ? snap.data.map((d, i) => (
                      <img
                          key={i}
                          style={{
                              display: "none",
                              position: "absolute",
                              inset: 0,
                              objectFit: "contain",
                          }}
                          src={urls.thumbHalfAlt(item?.project_id, d.preview_id)}
                          alt={d.index_in_a_clip.toString()}
                      />
                  ))
                : "Loading"} */}
        </VStack>
    )
}

export default Clip
