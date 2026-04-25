import { type ComponentProps, useRef } from "react"
import { showPreview } from "@/components/preview"
import { useThresholdDelay } from "@/hooks/useDecay"
import { DetailsImageContainer, DetailsImageContent } from "./common"
import { motion } from "motion/react"

const imgTransition = { duration: 0.25, ease: "circInOut" }

interface DetailsImageProps extends ComponentProps<typeof DetailsImageContainer> {
    id?: string
    src?: string
    srcHalf?: string
    maskSrc?: string
    naturalSize: { width: number; height: number }
    imgStyle?: ComponentProps<typeof DetailsImageContent>
    pixelated?: boolean
    dimmed?: boolean
    subitem?: boolean
}

function DetailsImage(props: DetailsImageProps) {
    const {
        id,
        src,
        srcHalf,
        maskSrc,
        naturalSize,
        imgStyle,
        pixelated,
        dimmed,
        subitem,
        ...restProps
    } = props

    const imgRef = useRef<HTMLImageElement>(null)

    const wheelBump = useThresholdDelay({
        time: 200,
        threshold: 100,
        callback: () => showPreview(imgRef.current, src),
    })

    const maskProps = maskSrc
        ? { maskImage: `url(${maskSrc})`, maskMode: "luminance", maskSize: "contain" }
        : null

    if (!srcHalf && !src) return null

    return (
        <DetailsImageContainer
            key={src}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            {...restProps}
            transition={{ duration: imgTransition.duration / 2, ease: "linear" }}
        >
            <DetailsImageContent
                // display="none"
                data-solid="true"
                width={naturalSize.width}
                height={naturalSize.height}
                ref={imgRef}
                src={src}
                alt={src}
                pixelated={pixelated}
                dimmed={dimmed}
                subitem={subitem}
                opacity={1}
                {...imgStyle}
                transition={{
                    duration: imgTransition.duration,
                    ease: "linear",
                }}
                onClick={(e: React.MouseEvent) => {
                    e.stopPropagation()
                    showPreview(imgRef.current, src)
                }}
                onWheel={(e) => {
                    if (e.deltaY < 0) wheelBump(0 - e.deltaY)
                }}
            />
            {maskProps && (
                <DetailsImageContent
                    border={"3px solid red"}
                    className={"check-bg"}
                    pointerEvents={"none"}
                    width={naturalSize.width}
                    height={naturalSize.height}
                    opacity={1}
                    {...maskProps}
                    {...imgStyle}
                    as={motion.div}
                />
            )}
        </DetailsImageContainer>
    )
}

export default DetailsImage
