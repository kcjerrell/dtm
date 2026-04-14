import { Flex } from "@chakra-ui/react"
import { type CSSProperties, useEffect, useRef } from "react"
import { useVideoContext } from "./context"

interface VideoImageProps extends ChakraProps {
    fit: "contain" | "cover"
    clickToPause?: boolean
    naturalSize?: { width: number; height: number }
    canvasStyle?: CSSProperties
}

export function VideoImage(props: VideoImageProps) {
    const { fit, clickToPause, naturalSize, canvasStyle, ...restProps } = props

    const { imgSrc, controls, frameUrls, autoStart } = useVideoContext({
        onFrameChanged: (frame) => {
            const img = framesRef.current[frame]
            if (!img) return
            if (!canvasRef.current) return
            const ctx = canvasRef.current.getContext("2d")
            if (!ctx) return
            drawImage(ctx, img)
        },
    })

    const canvasRef = useRef<HTMLCanvasElement>(null)
    const framesRef = useRef<(HTMLImageElement | null)[]>([])

    useEffect(() => {
        const img = new Image()
        img.src = imgSrc
        img.onload = () => {
            if (!canvasRef.current) return
            const ctx = canvasRef.current.getContext("2d")
            if (!ctx) return

            canvasRef.current.width = img.naturalWidth
            canvasRef.current.height = img.naturalHeight
            drawImage(ctx, img)
        }
    }, [imgSrc])

    useEffect(() => {
        const promises = frameUrls.map((url) => {
            return new Promise<HTMLImageElement | null>((resolve, reject) => {
                const img = new Image()
                img.src = url
                img.onload = () => {
                    framesRef.current.push(img)
                    resolve(img)
                }
                img.onerror = reject
            })
        })
        Promise.allSettled(promises).then((frames) => {
            framesRef.current = frames.map((f) => (f.status === "fulfilled" ? f.value : null))
            if (autoStart) {
                controls.play()
            }
        })
    }, [frameUrls, autoStart, controls.play])

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
            <canvas
                aria-label={"Video preview image"}
                ref={canvasRef}
                style={{
                    width: "100%",
                    height: "100%",
                    objectFit: fit,
                    ...canvasStyle,
                }}
                {...handlers}
            />
        </Flex>
    )
}

function drawImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
    const width = ctx.canvas.width // * window.devicePixelRatio
    const height = ctx.canvas.height // * window.devicePixelRatio
    ctx.drawImage(img, 0, 0, width, height)
}
