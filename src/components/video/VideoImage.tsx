import { Flex } from "@chakra-ui/react"
import type { CSSProperties } from "react"
import { useVideoContext } from "./context"

interface VideoImageProps extends ChakraProps {
    objectFit?: CSSProperties["objectFit"]
    clickToPause?: boolean
    naturalSize?: { width: number; height: number }
}

export function VideoImage(props: VideoImageProps) {
    const { objectFit, clickToPause, naturalSize, ...restProps } = props

    const { imgSrc, imgRef, controls } = useVideoContext()

    const handlers = clickToPause
        ? {
              onPointerDown: (e: React.PointerEvent) => {
                  e.stopPropagation()
                  controls.togglePlayPause()
              },
              onClick: (e: React.MouseEvent) => e.stopPropagation(),
          }
        : {}

    return (
        <Flex overflow={"hidden"} justifyContent={"center"} alignItems={"center"} {...restProps}>
            <img
                ref={imgRef}
                width={naturalSize?.width}
                height={naturalSize?.height}
                style={{
                    width: objectFit === "cover" ? "100%" : "auto",
                    height: objectFit === "cover" ? "100%" : "auto",
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: objectFit ?? "contain",
                }}
                src={imgSrc}
                alt={"clip"}
                {...handlers}
            />
        </Flex>
    )
}
