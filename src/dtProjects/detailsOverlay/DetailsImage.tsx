import { type ComponentProps, useRef } from "react"
import { showPreview } from "@/components/preview"
import { DetailsImageContainer, DetailsImageContent } from "./common"

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

    const maskProps = maskSrc
        ? { maskImage: `url(${maskSrc})`, maskMode: "luminance", maskSize: "contain" }
        : {}

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
                // {...maskProps}
                transition={{
                    duration: imgTransition.duration,
                    ease: "linear",
                }}
                onClick={(e: React.MouseEvent) => {
                    e.stopPropagation()
                    showPreview(imgRef.current, src)
                }}
            />
        </DetailsImageContainer>
    )
}

export default DetailsImage
