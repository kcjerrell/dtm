import { Box } from "@chakra-ui/react"
import { type CSSProperties, useEffect, useRef } from "react"
import type { Snapshot } from "valtio"
import { pdb } from "@/commands"
import urls from "@/commands/urls"
import type { UIControllerState } from "@/dtProjects/state/uiState"
import { useProxyRef } from "@/hooks/valtioHooks"

interface VideoFramesProps extends ChakraProps {
    image: Snapshot<UIControllerState["detailsView"]["item"]>
    half?: boolean
    objectFit?: CSSProperties["objectFit"]
}

function VideoFrames(props: VideoFramesProps) {
    const { image, half, objectFit, ...restProps } = props

    const { state, snap } = useProxyRef(() => ({
        data: [] as string[],
        start: 0,
    }))

    const getUrl = half ? urls.thumbHalf : urls.thumb

    const containerRef = useRef<HTMLDivElement>(null)
    const imgRef = useRef<HTMLImageElement>(null)
    const rafRef = useRef<number>(0)
    const frameRef = useRef<number>(0)

    useEffect(() => {
        if (!image) return
        pdb.getClip(image.id).then(async (data) => {
            if (!image) return
            if (!imgRef.current) return
            state.data = data.map((d) => getUrl(image.project_id, d.preview_id))
            await preloadImages(state.data)
            console.log("preloaded")
            const animate = (time: DOMHighResTimeStamp) => {
                if (!imgRef.current) {
                    rafRef.current = requestAnimationFrame(animate)
                    return
                }
                const t = ((time - state.start) / 1000) * 24
                const frame = Math.floor(t) % state.data.length
                if (frame !== frameRef.current) {
                    frameRef.current = frame
                    imgRef.current.src = state.data[frame]
                    // containerRef.current.children[frameRef.current]?.setAttribute(
                    //     "style",
                    //     "display: none",
                    // )
                    // containerRef.current.children[frameRef.current]?.setAttribute(
                    //     "style",
                    //     "display: block",
                    // )
                }
                rafRef.current = requestAnimationFrame(animate)
            }

            cancelAnimationFrame(rafRef.current)

            rafRef.current = requestAnimationFrame((time) => {
                state.start = time
                animate(time)
            })
        })

        return () => cancelAnimationFrame(rafRef.current)
    }, [image, state, getUrl])

    if (!image) return null

    return (
        <Box ref={containerRef} position="relative" {...restProps}>
            {/* {snap.data && image */}
            {/* ? snap.data.map((d, i) => ( */}
            <img
                // key={i}
                ref={imgRef}
                style={{
                    // display: "none",
                    // position: "absolute",
                    width: "100%",
                    height: "100%",
                    objectFit: objectFit ?? "contain",
                }}
                src={getUrl(image.project_id, image.preview_id)}
                alt={"clip"}
            />
            {/* )) */}
            {/* : "Loading"} */}
        </Box>
    )
}

export default VideoFrames

async function preloadImages(urls: string[]) {
    const promises = urls.map((url) => {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.src = url
            img.onload = resolve
            img.onerror = reject
        })
    })
    await Promise.all(promises)
}
