import { createContext, useContext, useEffect, useRef } from "react"
import { pdb } from "@/commands"
import urls from "@/commands/urls"
import type { ImageExtra } from "@/generated/types"
import { useProxyRef } from "@/hooks/valtioHooks"
import { everyNth } from "@/utils/helpers"
import { useFrameAnimation } from "./hooks"

export type VideoContextType = ReturnType<typeof useCreateVideoContext>

export const VideoContext = createContext<VideoContextType | null>(null)

type OnFrameChanged = (frame: number, fps: number, nFrames: number) => void
type OnPlaybackStateChanged = (playbackState: "playing" | "paused" | "seeking") => void

export type UseCreateVideoContextOpts = {
    image: ImageExtra
    half?: boolean
    halfFps?: boolean
    fps?: number
    onFrameChanged?: OnFrameChanged
    onPlaybackStateChanged?: OnPlaybackStateChanged
    autoStart?: boolean
}

export function useCreateVideoContext(opts: UseCreateVideoContextOpts) {
    const {
        image,
        half,
        halfFps,
        fps: fpsProp = 20,
        onFrameChanged,
        onPlaybackStateChanged,
        autoStart,
    } = opts

    
    const { state, snap } = useProxyRef(() => ({
        urls: [] as string[],
        playbackState: "paused" as "playing" | "paused" | "seeking",
        fps: fpsProp
    }))

    const fps = halfFps ? snap.fps / 2 : snap.fps
    
    const frameChangedHandlersRef = useRef<OnFrameChanged[]>([])
    const playbackStateChangedHandlersRef = useRef<OnPlaybackStateChanged[]>([])

    useEffect(() => {
        if (onFrameChanged) frameChangedHandlersRef.current.push(onFrameChanged)
        return () => {
            frameChangedHandlersRef.current = frameChangedHandlersRef.current.filter(
                (cb) => cb !== onFrameChanged,
            )
        }
    }, [onFrameChanged])

    useEffect(() => {
        if (onPlaybackStateChanged)
            playbackStateChangedHandlersRef.current.push(onPlaybackStateChanged)
        return () => {
            playbackStateChangedHandlersRef.current =
                playbackStateChangedHandlersRef.current.filter(
                    (cb) => cb !== onPlaybackStateChanged,
                )
        }
    }, [onPlaybackStateChanged])

    const getUrl = half ? urls.thumbHalf : urls.thumb
    const imgSrc = getUrl(image.project_id, image.preview_id)

    const imgRef = useRef<HTMLImageElement>(null)

    const controls = useFrameAnimation({
        fps,
        nFrames: snap.urls.length,
        autoStart,
        onChange: (frame) => {
            if (imgRef.current) imgRef.current.src = state.urls[frame]
            frameChangedHandlersRef.current.forEach((f) => {
                f(frame, fps, snap.urls.length)
            })
        },
        onStateChange: (videoState) => {
            console.log("state change", videoState)
            state.playbackState = videoState
            playbackStateChangedHandlersRef.current.forEach((f) => {
                f(videoState)
            })
        },
    })

    useEffect(() => {
        if (!image) return
        pdb.getClip(image.id).then(async (data) => {
            if (!image) return
            if (!imgRef.current) return

            const frameUrls = data.map((d) => getUrl(image.project_id, d.preview_id))
            if (halfFps) state.urls = everyNth(frameUrls, 2)
            else state.urls = frameUrls
            await preloadImages(state.urls)
        })
    }, [image, state, getUrl, halfFps])

    const setFps = (fps: number) => {
        state.fps = fps
    }

    return {
        imgRef,
        imgSrc,
        frameChangedHandlersRef,
        playbackStateChangedHandlersRef,
        fps: snap.fps,
        frames: snap.urls.length,
        controls,
        state,
        setFps
    } as const
}

interface UseVideoContextOpts {
    onFrameChanged?: OnFrameChanged
    onPlaybackStateChanged?: OnPlaybackStateChanged
}
export function useVideoContext(opts?: UseVideoContextOpts) {
    const { onFrameChanged, onPlaybackStateChanged } = opts ?? {}
    const ctx = useContext(VideoContext)
    if (!ctx) throw new Error("useVideoContext must be used within VideoFramesProvider")

    useEffect(() => {
        if (onFrameChanged) ctx.frameChangedHandlersRef.current.push(onFrameChanged)
        return () => {
            ctx.frameChangedHandlersRef.current = ctx.frameChangedHandlersRef.current.filter(
                (cb) => cb !== onFrameChanged,
            )
        }
    }, [onFrameChanged, ctx])

    useEffect(() => {
        if (onPlaybackStateChanged)
            ctx.playbackStateChangedHandlersRef.current.push(onPlaybackStateChanged)
        return () => {
            ctx.playbackStateChangedHandlersRef.current =
                ctx.playbackStateChangedHandlersRef.current.filter(
                    (cb) => cb !== onPlaybackStateChanged,
                )
        }
    }, [onPlaybackStateChanged, ctx])

    return ctx
}

async function preloadImages(urls: string[]) {
    const promises = urls.map((url) => {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.src = url
            img.onload = resolve
            img.onerror = reject
        })
    })
    await Promise.all(promises)
}
