import { chakra } from "@chakra-ui/react"
import { motion } from "motion/react"
import { useSnapshot } from "valtio"
import { useVideoThumbnail } from "../history/VideoThumbnailProvider"
import { getMetadataStore } from "../state/metadataStore"

function CurrentVideo() {
    const snap = useSnapshot(getMetadataStore())
    const { currentItem: currentImage } = snap

    const videoRef = useVideoThumbnail(currentImage?.id, "video")

    return (
        <Video
            preload={"auto"}
            crossOrigin={"anonymous"}
            key={currentImage?.id}
            src={currentImage?.url}
            initial={{ opacity: 0, zIndex: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, zIndex: 0, transition: { duration: 0 } }}
            transition={{ duration: 0 }}
            ref={videoRef}
        />
    )
}

export default CurrentVideo

export const Video = motion.create(
    chakra(
        "video",
        {
            base: {
                maxWidth: "100%",
                maxHeight: "100%",
                minWidth: 0,
                minHeight: 0,
                borderRadius: "sm",
                boxShadow: "pane1",
            },
        },
        {
            defaultProps: {
                draggable: false,
                controls: true,
                autoPlay: true,
                loop: true,
                muted: true,
                playsInline: true,
            },
        },
    ),
)
