import { pdb, TensorHistoryNode } from "@/commands"
import urls from "@/commands/urls"
import { UIControllerState } from "@/dtProjects/state/uiState"
import { useProxyRef } from "@/hooks/valtioHooks"
import { Box } from "@chakra-ui/react"
import { useEffect, useRef } from "react"
import { Snapshot } from "valtio"

interface VideoFramesProps extends ChakraProps {
    image: Snapshot<UIControllerState["detailsView"]["item"]>
}

function VideoFrames(props: VideoFramesProps) {
    const { image, ...restProps } = props

    const { state, snap } = useProxyRef(() => ({
        data: [] as TensorHistoryNode[],
        start: 0,
    }))

    const containerRef = useRef<HTMLDivElement>(null)
    const rafRef = useRef<number>(0)
    const frameRef = useRef<number>(0)

    useEffect(() => {
        if (!image) return
        console.log(image)
        pdb.getClip(image.id).then((data) => {
            state.data = data
        })

        const animate = (time: DOMHighResTimeStamp) => {
            if (!containerRef.current || containerRef.current.children.length !== state.data.length) {
                rafRef.current = requestAnimationFrame(animate)
                return
            }
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
    }, [image, state])

    return (
        <Box ref={containerRef} position="relative" width={"full"} height={"full"} {...restProps}>
            {snap.data && image
                ? snap.data.map((d, i) => (
                      <img
                          key={i}
                          style={{
                              display: "none",
                              position: "absolute",
                              inset: 0,
                              objectFit: "contain",
                          }}
                          src={urls.thumbHalf(image.project_id, d.preview_id)}
                          alt={d.index_in_a_clip.toString()}
                      />
                  ))
                : "Loading"}
        </Box>
    )
}

export default VideoFrames
