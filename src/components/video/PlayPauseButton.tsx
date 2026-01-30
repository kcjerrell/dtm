import { useState } from "react"
import IconButton, { type IconButtonProps } from "../IconButton"
import { PiPauseFill, PiPlayFill } from "../icons/icons"
import { useVideoContext } from "./context"

interface PlayPauseButtonProps extends IconButtonProps {}

function PlayPauseButton(props: PlayPauseButtonProps) {
    const { ...restProps } = props

    const [playbackState, setPlaybackState] = useState<"playing" | "paused" | "seeking">("paused")
    const [frame, setFrame] = useState(0)

    const { controls } = useVideoContext({
        onPlaybackStateChanged: setPlaybackState,
        onFrameChanged: (f) => {
            if (playbackState === "seeking") setFrame(f + 1)
        },
    })

    return (
        <IconButton
            flex={"0 0 auto"}
            onClick={() => {
                controls.togglePlayPause()
            }}
            bgColor={"grays.12"}
            borderRadius={"full"}
            {...restProps}
        >
            {playbackState === "playing" ? (
                <PiPauseFill />
            ) : playbackState === "paused" ? (
                <PiPlayFill />
            ) : (
                frame
            )}
        </IconButton>
    )
}

export default PlayPauseButton
