import { Grid, HStack } from "@chakra-ui/react"
import type { ImageExtra } from "@/commands"
import VideoAudio from "@/components/video/Audio"
import { VideoContext, type VideoContextType } from "@/components/video/context"
import MuteButton from "@/components/video/MuteButton"
import PlayPauseButton from "@/components/video/PlayPauseButton"
import Seekbar from "@/components/video/Seekbar"
import Video from "@/components/video/Video"
import { VideoImage } from "@/components/video/VideoImage"
import { useGetContext } from "@/hooks/useGetContext"

interface VideoItemProps extends ChakraProps {
    item: ImageExtra
    videoRef?: React.RefObject<VideoContextType | null>
    naturalWidth: number
    naturalHeight: number
}

function VideoItem(props: VideoItemProps) {
    const { item, videoRef, naturalWidth, naturalHeight } = props

    const { Extractor } = useGetContext(VideoContext, videoRef)

    return (
        <Grid
            onClick={(e) => e.stopPropagation()}
            templateRows={"1fr auto auto"}
            // width={"100%"}
            // height={"100%"}
            maxHeight={"100%"}
            overflow={"hidden"}
            gridArea={"image"}
        >
            <Video image={item} autoStart={false} key={item.id}>
                <Extractor />
                <VideoImage
                    clickToPause
                    data-solid
                    naturalSize={{ width: naturalWidth, height: naturalHeight }}
                    width={"100%"}
                    height={"100%"}
                    maxWidth={"100%"}
                    maxHeight={"100%"}
                    fit={"contain"}
                    canvasStyle={{ borderRadius: "0.5rem" }}
                    borderRadius={"0.5rem"}
                />
                <VideoAudio />
                <HStack data-solid="true" width={"100%"} paddingY={2} flexShrink={0}>
                    <PlayPauseButton />
                    <Seekbar />
                    <MuteButton />
                </HStack>
            </Video>
        </Grid>
    )
}

export default VideoItem
