import { createContext, useContext, useEffect, useMemo, useRef } from "react"
import { ref } from "valtio"
import type { ImageExtra } from "@/commands"
import DTPService from "@/commands/DtpService"
import urls from "@/commands/urls"
import { useProxyRef } from "@/hooks/valtioHooks"
import { useSettingRef } from "@/state/settings"
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

    const defaultMuteRef = useSettingRef("ui.defaultMute")

    const { state, snap } = useProxyRef(() => ({
        urls: [] as string[],
        playbackState: "paused" as "playing" | "paused" | "seeking",
        isMuted: defaultMuteRef.current,
        fps: fpsProp,
        wasFpsChanged: false,
        audioSrc: null as string | null,
        // sync: null as IFrameSync | null,
    }))

    const syncRef = useRef<IFrameSync | null>(null)
    const currentFrameRef = useRef<number | undefined>(undefined)

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
            play: () => syncRef.current?.play(),
            pause: () => syncRef.current?.pause(),
            togglePlayPause: () => {
                if (snap.playbackState === "playing") syncRef.current?.pause()
                else syncRef.current?.play()
            },
            seek: (pos: number) => syncRef.current?.seek(pos),
            endSeek: (resume?: boolean) => syncRef.current?.endSeek(resume),
            posMv: syncRef.current?.posMv,
            /** kind of weird, but -1 will toggle */
            setMute: (value: boolean | -1) => syncRef.current?.setMute?.(value),
            getFrame: () => currentFrameRef.current,
        }),
        [snap.playbackState],
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

            if (syncRef.current) syncRef.current.dispose()
            if (state.audioSrc && audioRef.current) {
                syncRef.current = ref(
                    new AudioFrameSync({
                        fps,
                        nFrames: state.urls.length,
                        autoStart: false,
                        audio: audioRef,
                        defaultMuted: defaultMuteRef.current,
                        onFrameChanged: (frame) => {
                            currentFrameRef.current = frame
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
                        onMutedChanged: (muted) => {
                            state.isMuted = muted
                            defaultMuteRef.current = muted
                        },
                    }),
                )
            } else {
                syncRef.current = ref(
                    new FrameSync({
                        fps,
                        nFrames: state.urls.length,
                        autoStart: false,
                        onFrameChanged: (frame) => {
                            currentFrameRef.current = frame
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

        return () => syncRef.current?.dispose()
    }, [image, state, getUrl, halfFps, fps, defaultMuteRef])

    return {
        imgSrc,
        audioRef,
        frameChangedHandlersRef,
        playbackStateChangedHandlersRef,
        audioSrc: snap.audioSrc,
        isMuted: snap.isMuted,
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
