import { createContext, useContext, useEffect, useMemo, useRef } from "react"
import { ref } from "valtio"
import type { ImageExtra } from "@/commands"
import DTPService from "@/commands/DtpService"
import urls from "@/commands/urls"
import { useProxyRef } from "@/hooks/valtioHooks"
import { everyNth } from "@/utils/helpers"
import { AudioFrameSync, FrameSync, type IFrameSync } from "./sync"

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
        fps: fpsProp,
        wasFpsChanged: false,
        audioSrc: null as string | null,
        sync: null as IFrameSync | null,
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

    const audioRef = useRef<HTMLAudioElement>(null)

    const controls = useMemo(
        () => ({
            play: () => snap.sync?.play(),
            pause: () => snap.sync?.pause(),
            togglePlayPause: () => {
                if (snap.playbackState === "playing") snap.sync?.pause()
                else snap.sync?.play()
            },
            seek: (pos: number) => snap.sync?.seek(pos),
            endSeek: (resume?: boolean) => snap.sync?.endSeek(resume),
            posMv: snap.sync?.posMv,
        }),
        [snap.playbackState, snap.sync],
    )

    const setFps = (fps: number) => {
        state.fps = fps
        state.wasFpsChanged = true
    }

    useEffect(() => {
        if (!image || !image.clip_id) return

        DTPService.getClip(image.id, image.clip_id).then(async (data) => {
            if (!state.wasFpsChanged) state.fps = data.clip.framesPerSecond

            if (data.clip.audioId && data.clip.count && data.clip.framesPerSecond)
                state.audioSrc = urls.audio(image.project_id, `audio_${data.clip.audioId}`, {
                    duration: data.clip.count / data.clip.framesPerSecond,
                })

            const frameUrls = data.frames.map((d) => getUrl(image.project_id, d.previewId))
            if (halfFps) state.urls = everyNth(frameUrls, 2)
            else state.urls = frameUrls
            await preloadImages(state.urls)

            if (state.sync) state.sync.dispose()
            if (state.audioSrc && audioRef.current) {
                state.sync = ref(
                    new AudioFrameSync({
                        fps,
                        nFrames: state.urls.length,
                        autoStart: false,
                        audio: audioRef,
                        onFrameChanged: (frame) => {
                            frameChangedHandlersRef.current.forEach((f) => {
                                f(frame, fps, state.urls.length)
                            })
                        },
                        onStateChanged: (videoState) => {
                            state.playbackState = videoState
                            playbackStateChangedHandlersRef.current.forEach((f) => {
                                f(videoState)
                            })
                        },
                    }),
                )
            } else {
                state.sync = ref(
                    new FrameSync({
                        fps,
                        nFrames: state.urls.length,
                        autoStart: false,
                        onFrameChanged: (frame) => {
                            frameChangedHandlersRef.current.forEach((f) => {
                                f(frame, fps, state.urls.length)
                            })
                        },
                        onStateChanged: (videoState) => {
                            state.playbackState = videoState
                            playbackStateChangedHandlersRef.current.forEach((f) => {
                                f(videoState)
                            })
                        },
                    }),
                )
            }
        })

        return () => state.sync?.dispose()
    }, [image, state, getUrl, halfFps, fps])

    return {
        imgSrc,
        audioRef,
        frameChangedHandlersRef,
        playbackStateChangedHandlersRef,
        audioSrc: snap.audioSrc,
        fps: snap.fps,
        frames: snap.urls.length,
        frameUrls: snap.urls,
        controls,
        state,
        setFps,
        autoStart,
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
    await Promise.allSettled(promises)
}
