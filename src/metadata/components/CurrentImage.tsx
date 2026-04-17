import { chakra } from "@chakra-ui/react"
import { motion } from "motion/react"
import { useRef } from "react"
import { useSnapshot } from "valtio"
import { showPreview } from "@/components/preview"
import { getMetadataStore } from "../state/metadataStore"
import { useThresholdDelay } from "@/hooks/useDecay"

function CurrentImage() {
    const snap = useSnapshot(getMetadataStore())
    const { currentItem: currentImage } = snap

    const imgRef = useRef<HTMLImageElement>(null)

    const wheelBump = useThresholdDelay({
        time: 200,
        threshold: 100,
        callback: () => showPreview(imgRef.current),
    })

    return (
        <Img
            data-testid="current-image"
            key={currentImage?.id}
            ref={imgRef}
            src={currentImage?.url}
            onClick={(e) => showPreview(e.currentTarget)}
            onWheel={(e) => {
                if (e.deltaY < 0) wheelBump(0 - e.deltaY)
            }}
            initial={{ opacity: 0, zIndex: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, zIndex: 0, transition: { duration: 0 } }}
            transition={{ duration: 0 }}
        />
    )
}

export default CurrentImage

export const Img = motion.create(
    chakra(
        "img",
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
        { defaultProps: { draggable: false } },
    ),
)
