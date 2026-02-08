import {
    type AnimationPlaybackControlsWithThen,
    animate,
    useMotionValue,
    useMotionValueEvent,
    useTransform,
} from "motion/react"
import { useEffect, useMemo, useRef } from "react"

export type UseFrameAnimationOpts = {
    nFrames: number
    fps: number
    onChange?: (frame: number) => void
    onStateChange?: (state: "playing" | "paused" | "seeking") => void
    autoStart?: boolean
}

export function useFrameAnimation(opts: UseFrameAnimationOpts) {
    const { nFrames, fps, onChange, onStateChange, autoStart } = opts
    const posMv = useMotionValue(0)
    const frameMv = useTransform(posMv, (pos) => Math.floor(pos * (nFrames - 1)))

    useMotionValueEvent(frameMv, "change", (frame) => {
        onChange?.(frame)
    })

    const animationRef = useRef<AnimationPlaybackControlsWithThen | null>(null)
    const onStateChangeRef = useRef(onStateChange)

    // Update the ref when the callback changes
    useEffect(() => {
        onStateChangeRef.current = onStateChange
    }, [onStateChange])

    useEffect(() => {
        if (!nFrames) return
        const elapsed =
            (animationRef.current?.time ?? 0) / (animationRef.current?.iterationDuration || 1)
        const duration = nFrames / fps
        const isPlaying = animationRef.current?.state === "running"
        animationRef.current = animate(posMv, [0, 1], {
            duration,
            repeat: Infinity,
            repeatType: "loop",
            ease: "linear",
            autoplay: isPlaying || autoStart,
        })
        animationRef.current.time = elapsed * duration
        onStateChangeRef.current?.(autoStart ? "playing" : "paused")
    }, [autoStart, fps, posMv, nFrames])

    const controls = useMemo(
        () => ({
            pause: () => {
                animationRef.current?.pause()
                onStateChangeRef.current?.("paused")
            },
            play: () => {
                animationRef.current?.play()
                onStateChangeRef.current?.("playing")
            },
            togglePlayPause: () => {
                console.log(animationRef.current)
                if (animationRef.current?.state === "running") {
                    animationRef.current?.pause()
                    onStateChangeRef.current?.("paused")
                } else {
                    animationRef.current?.play()
                    onStateChangeRef.current?.("playing")
                }
            },
            seek: (pos: number, setSeekState?: boolean) => {
                if (animationRef.current) animationRef.current.time = (pos * nFrames) / fps
                if (setSeekState) {
                    animationRef.current?.pause()
                    onStateChangeRef.current?.("seeking")
                }
            },
            endSeek: (resume?: boolean) => {
                if (resume) {
                    animationRef.current?.play()
                    onStateChangeRef.current?.("playing")
                } else {
                    animationRef.current?.pause()
                    onStateChangeRef.current?.("paused")
                }
            },
            posMv,
            frameMv,
        }),
        [frameMv, posMv, fps, nFrames],
    )

    return controls
}
