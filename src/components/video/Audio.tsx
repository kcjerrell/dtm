import { useVideoContext } from "./context"

function VideoAudio() {
    const { audioSrc, audioRef } = useVideoContext()
    
    if (!audioSrc) return null

    // biome-ignore lint/a11y/useMediaCaption: <no caption possible>
    return <audio data-solid={"true"} ref={audioRef} src={audioSrc} loop={true} />
}

export default VideoAudio
