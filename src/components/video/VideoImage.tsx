import { Box } from "@chakra-ui/react"
import type { CSSProperties } from "react"
import { useVideoContext } from "./context"

interface VideoImageProps extends ChakraProps {
    objectFit?: CSSProperties["objectFit"]
    clickToPause?: boolean
}

export function VideoImage(props: VideoImageProps) {
    const { objectFit, clickToPause, ...restProps } = props

    const { imgSrc, imgRef, controls } = useVideoContext()

    const handlers = clickToPause
        ? {
              onPointerDown: (e) => {
                  e.stopPropagation()
                  controls.togglePlayPause()
                  console.log("I got clicked")
              },
              onClick: (e) => e.stopPropagation(),
          }
        : {}

    return (
        <Box position="relative" {...restProps}>
            <img
                ref={imgRef}
                style={{
                    width: "100%",
                    height: "100%",
                    objectFit: objectFit ?? "contain",
                }}
                src={imgSrc}
                alt={"clip"}
                {...handlers}
            />
        </Box>
    )
}
