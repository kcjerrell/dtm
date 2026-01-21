import { createContext, useContext, useEffect, useRef } from "react"
import { pdb } from "@/commands"
import urls from "@/commands/urls"
import type { ImageExtra } from "@/generated/types"
import { useProxyRef } from "@/hooks/valtioHooks"
import { everyNth } from "@/utils/helpers"
import { useFrameAnimation } from "./hooks"

export type VideoContextType = {
    imgRef: React.RefObject<HTMLImageElement>
    imgSrc: string
    callbacksRef: React.RefObject<OnFrameChanged[]>
    controls: ReturnType<typeof useFrameAnimation>
    fps: number
    frames: number
}

export const VideoContext = createContext<VideoContextType | null>(null)

type OnFrameChanged = (frame: number, fps: number, nFrames: number) => void

export type UseVideoContextOpts = {
    image: ImageExtra
    half?: boolean
    halfFps?: boolean
    fps?: number
    onFrameChanged?: OnFrameChanged
    autoStart?: boolean
}

export function useCreateVideoContext(opts: UseVideoContextOpts) {
    const { image, half, halfFps, fps: fpsProp = 20, onFrameChanged, autoStart } = opts

    const fps = halfFps ? fpsProp / 2 : fpsProp

    const { state, snap } = useProxyRef(() => ({
        data: [] as string[],
        start: 0,
    }))

    const callbacksRef = useRef<OnFrameChanged[]>([])

    useEffect(() => {
        if (onFrameChanged) callbacksRef.current.push(onFrameChanged)
        return () => {
            callbacksRef.current = callbacksRef.current.filter((cb) => cb !== onFrameChanged)
        }
    }, [onFrameChanged])

    const getUrl = half ? urls.thumbHalf : urls.thumb
    const imgSrc = getUrl(image.project_id, image.preview_id)

    const imgRef = useRef<HTMLImageElement>(null)

    const controls = useFrameAnimation({
        fps,
        nFrames: snap.data.length,
        autoStart,
        onChange: (frame) => {
            if (imgRef.current) imgRef.current.src = state.data[frame]
        },
    })

    useEffect(() => {
        if (!image) return
        pdb.getClip(image.id).then(async (data) => {
            if (!image) return
            if (!imgRef.current) return

            const frameUrls = data.map((d) => getUrl(image.project_id, d.preview_id))
            if (halfFps) state.data = everyNth(frameUrls, 2)
            else state.data = frameUrls
            await preloadImages(state.data)
        })
    }, [image, state, getUrl, halfFps])

    return {
        imgRef,
        imgSrc,
        callbacksRef,
        fps,
        frames: state.data.length,
        controls
    }
}

export function useVideoContext(onFrameChanged?: OnFrameChanged) {
    const ctx = useContext(VideoContext)
    if (!ctx) throw new Error("useVideoContext must be used within VideoFramesProvider")

    useEffect(() => {
        if (onFrameChanged) ctx.callbacksRef.current.push(onFrameChanged)
        return () => {
            ctx.callbacksRef.current = ctx.callbacksRef.current.filter(
                (cb) => cb !== onFrameChanged,
            )
        }
    }, [onFrameChanged, ctx])

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
