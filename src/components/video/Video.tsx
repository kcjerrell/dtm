import type { ImageExtra } from "@/generated/types"
import { useCreateVideoContext, VideoContext } from "./context"

interface VideoFramesProps {
    image: ImageExtra
    half?: boolean
    halfFps?: boolean
    fps?: number
    autoStart?: boolean
    children?: React.ReactNode
}

function Video(props: VideoFramesProps) {
    const { image, half, fps, halfFps, autoStart, children } = props
    const cv = useCreateVideoContext({ image, half, halfFps, fps, autoStart })

    if (!image) return null

    return <VideoContext value={cv}>{children}</VideoContext>
}

export default Video
