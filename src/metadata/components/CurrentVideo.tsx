import { chakra } from "@chakra-ui/react"
import { motion } from "motion/react"
import { useSnapshot } from "valtio"
import { TMap } from "@/utils/TMap"
import { useVideoThumbnail } from "../history/VideoThumbnailProvider"
import { getMetadataStore } from "../state/metadataStore"
import type { VideoItem } from "../state/VideoItem"

const videoTime = TMap.withDefaultValue((_: string) => 0)

function CurrentVideo() {
    const state = getMetadataStore()
    const snap = useSnapshot(state)
    const currentItem = snap.currentItem as VideoItem

    const videoRef = useVideoThumbnail(currentItem?.id, "video")

    return (
        <Video
            preload={"metadata"}
            crossOrigin={"anonymous"}
            key={currentItem?.id}
            src={currentItem?.url}
            initial={{ opacity: 0, zIndex: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, zIndex: 0, transition: { duration: 0 } }}
            transition={{ duration: 0 }}
            ref={videoRef}
            onTimeUpdate={(e) => {
                videoTime.set(currentItem?.id, e.currentTarget.currentTime)
            }}
            onLoadedMetadata={(e) => {
                e.currentTarget.currentTime = videoTime.get(currentItem?.id)
            }}
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
