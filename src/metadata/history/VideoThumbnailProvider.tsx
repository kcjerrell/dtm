import {
    createContext,
    type PropsWithChildren,
    type RefObject,
    useContext,
    useEffect,
    useMemo,
    useRef,
} from "react"

type ThumbnailRef = RefObject<HTMLCanvasElement | null>
type VideoRef = RefObject<HTMLVideoElement | null>

type VideoThumbnailContext = {
    canvasRefs: RefObject<Record<string, ThumbnailRef>>
    videoRef: RefObject<VideoRef | null>
    frameRequest: RefObject<number | null>
    activeId: RefObject<string | null>
}

const Context = createContext<VideoThumbnailContext | null>(null)

export function useVideoThumbnail(
    id: string | undefined,
    type: "video",
): RefObject<HTMLVideoElement>
export function useVideoThumbnail(
    id: string | undefined,
    type: "thumbnail",
): RefObject<HTMLCanvasElement>
export function useVideoThumbnail(id: string | undefined, type: "video" | "thumbnail") {
    const cv = useContext(Context)
    if (!cv) throw new Error("useVideoThumbnail must be used within a VideoThumbnailProvider")

    const ref = useRef<HTMLVideoElement | HTMLCanvasElement>(null)

    useEffect(() => {
        if (!id) return
        if (type === "thumbnail") {
            // for a thumbnail, we store the ref
            cv.canvasRefs.current[id] = ref as ThumbnailRef
            return () => {
                delete cv.canvasRefs.current[id]
            }
        } else if (type === "video") {
            // for a video, we replace the video ref with this one
            cv.videoRef.current = ref as VideoRef
            cv.activeId.current = id

            // and hook up to the video frame
            if (cv.videoRef.current?.current) {
                const video = cv.videoRef.current?.current
                const onFrame = () => {
                    const canvas = cv.canvasRefs.current[id]?.current
                    if (!canvas) return
                    const ctx = canvas.getContext("2d")
                    if (!ctx) return

                    if (video.videoWidth && video.videoHeight && canvas.width && canvas.height) {
                        const videoRatio = video.videoWidth / video.videoHeight
                        const canvasRatio = canvas.width / canvas.height
                        let sw: number, sh: number, sx: number, sy: number

                        if (videoRatio > canvasRatio) {
                            sh = video.videoHeight
                            sw = video.videoHeight * canvasRatio
                            sx = (video.videoWidth - sw) / 2
                            sy = 0
                        } else {
                            sw = video.videoWidth
                            sh = video.videoWidth / canvasRatio
                            sx = 0
                            sy = (video.videoHeight - sh) / 2
                        }

                        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
                    }
                    cv.frameRequest.current = video.requestVideoFrameCallback(onFrame)
                }
                cv.frameRequest.current = video.requestVideoFrameCallback(onFrame)
                return () => {
                    if (cv.frameRequest.current) {
                        video.cancelVideoFrameCallback(cv.frameRequest.current)
                    }
                }
            }
        }
    }, [cv, id, type])

    return ref
}

export function VideoThumbnailProvider(props: PropsWithChildren) {
    const canvasRefs = useRef<Record<string, ThumbnailRef>>({})
    const videoRef = useRef<VideoRef | null>(null)
    const frameRequest = useRef<number | null>(null)
    const activeId = useRef<string | null>(null)

    const cv = useMemo(() => ({ canvasRefs, videoRef, frameRequest, activeId }), [])
    return <Context value={cv}>{props.children}</Context>
}
