import { Box, type BoxProps } from "@chakra-ui/react"
import {
    type MotionProps,
    motion, 
    type ValueAnimationTransition
} from "motion/react"
import { createRef, useEffect, useRef, useState } from "react"
import { proxy, ref, useSnapshot } from "valtio"
import { Hotkey } from "@/hooks/keyboard"
import { useSpringRect } from "@/hooks/motion"
import { SPRING, useZoomable } from "./useZoomable"

const store = proxy({
    showPreview: false,
    sourceElement: ref(createRef<HTMLImageElement | null>()),
    src: null as string | null,
    isLoaded: false,
})

export function showPreview(srcElem?: HTMLImageElement | null, src?: string) {
    store.sourceElement.current = srcElem ?? null
    const newSrc = src ?? srcElem?.src ?? null
    if (newSrc !== store.src) {
        store.src = newSrc
        store.isLoaded = false
    }
    if (store.src) store.showPreview = true
}

export function hidePreview() {
    store.showPreview = false
}

export function useIsPreviewActive() {
    const { showPreview } = useSnapshot(store)
    return showPreview
}

interface PreviewProps extends BoxProps {}

const posTransition: ValueAnimationTransition<number> = {
    duration: 0.3,
    ease: "circOut",
}

export function Preview(props: PreviewProps) {
    const { ...restProps } = props
    const snap = useSnapshot(store)
    const { src, showPreview: show, sourceElement, isLoaded } = snap

    if (sourceElement.current) return <PreviewZoom key={src} {...restProps} />

    return (
        <Box
            key={src}
            width={"100vw"}
            height={"100vh"}
            overflow={"clip"}
            position={"absolute"}
            zIndex={20}
            bgColor={"black/90"}
            onClick={() => hidePreview()}
            pointerEvents={show ? "all" : "none"}
            {...restProps}
            asChild
        >
            <motion.div
                style={{
                    backgroundColor: "#000000",
                }}
                initial={{
                    backgroundColor: "#000000",
                    // opacity: 0,
                }}
                animate={{
                    backgroundColor: show ? "#000000dd" : "#00000000",
                    // opacity: show ? 1 : 0,
                }}
                transition={{
                    // ...posTransition,
                    // duration: show ? (posTransition.duration ?? 0) * 1.5 : posTransition.duration,
                    // opacity: {
                    // 	duration: 0,
                    // 	delay: show ? 0 : posTransition.duration,
                    // },
                    duration: 0.2,
                    delay: show ? 0 : 0.1,
                    ease: "circOut",
                }}
            >
                {show && !isLoaded && (
                    <DotSpinner
                        color={"check.1"}
                        position={"absolute"}
                        width={"20%"}
                        height={"20%"}
                        top={"40%"}
                        left={"40%"}
                    />
                )}

                <motion.img
                    ref={(e) => {
                        if (e)
                            e.onload = () => {
                                // setTimeout(() => {
                                store.isLoaded = true
                                // }, 5000)
                            }
                    }}
                    style={{
                        // position: "absolute",
                        objectFit: "contain",
                        // left: 0,
                        // top: 0,
                        width: "100%",
                        height: "100%",
                        transformOrigin: "center center",
                    }}
                    initial={{
                        opacity: 0,
                        scale: 0.9,
                    }}
                    animate={{
                        opacity: isLoaded && show ? 1 : 0,
                        scale: isLoaded && show ? 1 : 0.9,
                    }}
                    src={src ?? undefined}
                    transition={{ duration: 0.2, delay: show ? 0.1 : 0, ease: "circOut" }}
                />
            </motion.div>
        </Box>
    )
}

function PreviewZoom(props: PreviewProps) {
    const { ...restProps } = props

    const snap = useSnapshot(store)
    const { src, showPreview: show } = snap

    const [contentSize, setContentSize] = useState<{ width: number; height: number }>()

    const containerRef = useRef<HTMLDivElement>(null)
    const { handlers, style, reset } = useZoomable(containerRef, { contentSize })

    // const [fromRect, setFromRect] = useState<DOMRect>()

    const imgRef = useRef<HTMLImageElement>(null)
    const [leftMv, topMv, widthMv, heightMv] = useSpringRect(0, 0, 0, 0, SPRING)

    useEffect(() => {
        const updateLayout = () => {
             const sourceElement = store.sourceElement.current
             if (!sourceElement) return
             const rect = contain(
                 sourceElement.naturalWidth,
                 sourceElement.naturalHeight,
                 window.innerWidth,
                 window.innerHeight
             )
             setContentSize({ width: rect.width, height: rect.height })
             return rect
        }
        
        // Initial setup for useZoomable constraints
        updateLayout()

        const handleResize = () => {
            const newRect = updateLayout()
            if (newRect) {
                // Update motion values on resize so the image stays centered/contained
                // If we are showing the preview, we should be at the target rect which is newRect
                // If not showing, we should be at source rect (but source might have moved too?)
                // For now, let's assume we mainly care about resizing while open.
                if (show) {
                     leftMv.set(newRect.left)
                     topMv.set(newRect.top)
                     widthMv.set(newRect.width)
                     heightMv.set(newRect.height)
                }
            }
        }

        window.addEventListener("resize", handleResize)
        return () => window.removeEventListener("resize", handleResize)
    }, [heightMv, leftMv, widthMv, topMv, show])

    useEffect(() => {
        const sourceElement = store.sourceElement.current
        if (!sourceElement || !imgRef.current) return

        const originalRect = sourceElement.getBoundingClientRect()
        const previewRect = contain(
            sourceElement.naturalWidth,
            sourceElement.naturalHeight,
            window.innerWidth,
            window.innerHeight,
        )

        // Ensure we have size set for constraints if not already
        setContentSize({ width: previewRect.width, height: previewRect.height })

        if (show) {
             // OPENING
             // 1. Set initial position to source (jump)
             if (leftMv.get() === 0) { // Only jump if not already initialized or from 0? 
                 leftMv.jump(originalRect.left)
                 topMv.jump(originalRect.top)
                 widthMv.jump(originalRect.width)
                 heightMv.jump(originalRect.height)
             }
             
             // 2. Animate to target (set)
             requestAnimationFrame(() => {
                 leftMv.set(previewRect.left)
                 topMv.set(previewRect.top)
                 widthMv.set(previewRect.width)
                 heightMv.set(previewRect.height)
             })

             // Visibility: Hide source, Show floating
             sourceElement.style.visibility = "hidden"
             imgRef.current.style.visibility = "visible"

        } else {
             // CLOSING
             // Animate back to source
             leftMv.set(originalRect.left)
             topMv.set(originalRect.top)
             widthMv.set(originalRect.width)
             heightMv.set(originalRect.height)

             // Visibility: 
             // Visibility: 
             // Switch visibility after animation duration (200ms)
             setTimeout(() => {
                 sourceElement.style.visibility = "visible"
                 if (imgRef.current) imgRef.current.style.visibility = "hidden"
             }, 200)
        }

        return () => {
             // Cleanup visibility on unmount or change
            //  if (sourceElement) sourceElement.style.visibility = "visible"
        }
    }, [leftMv, widthMv, topMv, heightMv, show])

    return (
        <>
            {show && (
                <Hotkey
                    scope="preview"
                    handlers={{
                        escape: () => {
                            reset()
                            hidePreview()
                        },
                    }}
                />
            )}
            <Box
                ref={containerRef}
                width={"100vw"}
                height={"100vh"}
                overflow={"clip"}
                position={"absolute"}
                zIndex={20}
                bgColor={"black/90"}
                onClick={() => {
                    reset()
                    hidePreview()
                }}
                pointerEvents={show ? "all" : "none"}
                touchAction={"none"}
                {...restProps}
                asChild
            >
                <motion.div
                    {...handlers}
                    style={{
                        ...style,
                    }}
                    initial={{
                        opacity: 0,
                        backgroundColor: "#00000000",
                    }}
                    animate={{
                        backgroundColor: show ? "#000000dd" : "#00000000",
                        opacity: show ? 1 : 0,
                    }}
                    transition={{
                        ...posTransition,
                        duration: show
                            ? (posTransition.duration ?? 0) * 1.5
                            : posTransition.duration,
                        opacity: {
                            duration: 0,
                            delay: show ? 0 : posTransition.duration,
                        },
                    }}
                >
                    <motion.img
                        ref={imgRef}
                        style={{
                            position: "absolute",
                            objectFit: "contain",
                            left: leftMv,
                            top: topMv,
                            width: widthMv,
                            height: heightMv,
                        }}
                        src={src ?? undefined}
                        transition={posTransition}
                    />
                </motion.div>
            </Box>
        </>
    )
}

export function contain(
    naturalWidth: number,
    naturalHeight: number,
    innerWidth: number,
    innerHeight: number,
): DOMRect {
    const aspectRatio = naturalWidth / naturalHeight
    let width = innerWidth
    let height = innerWidth / aspectRatio

    if (height > innerHeight) {
        height = innerHeight
        width = innerHeight * aspectRatio
    }

    const left = (innerWidth - width) / 2
    const top = (innerHeight - height) / 2

    // DOMRect: x, y, width, height, top, right, bottom, left
    return {
        x: left,
        y: top,
        width,
        height,
        top,
        left,
        right: left + width,
        bottom: top + height,
    } as DOMRect
}

export function DotSpinner(props: BoxProps) {
    const { style, ...rest } = props

    return (
        <Box perspective={200} transformStyle={"preserve-3d"} {...rest}>
            <motion.svg
                style={{ perspective: 200, transformStyle: "preserve-3d" }}
                viewBox={"0 0 100 100"}
            >
                <Dot delay={0} cx={25} ix={-20} iy={5} />
                <Dot delay={0.2} cx={50} ix={5} iy={-20} />
                <Dot delay={0.4} cx={75} ix={20} iy={-5} />
            </motion.svg>
        </Box>
    )
}

const loopTrans = (delay: number) =>
    ({
        repeat: Infinity,
        repeatType: "loop",
        times: [0, 0.1, 1],
        ease: ["backIn", "backOut", "linear"],
        duration: 1.5,
        delay,
    }) as MotionProps["transition"]

function Dot(props: Record<string, number>) {
    const { delay, cx } = props
    return (
        <motion.ellipse
            cx={cx}
            cy={50}
            rx={5}
            ry={5}
            fill={"currentColor"}
            initial={{
                y: 0,
                opacity: 0,
            }}
            animate={{
                opacity: 1,
                // rx: [2, 8, 5],
                // ry: [2, 8, 5],
                y: [0, -15, 0],
                // cy: [0, 15, 0]
            }}
            transition={{ ...loopTrans(delay), opacity: { duration: 0.2, delay: delay } }}
        />
    )
}
