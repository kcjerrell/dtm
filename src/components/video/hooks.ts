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
    autoStart?: boolean
}

export function useFrameAnimation(opts: UseFrameAnimationOpts) {
    const { nFrames, fps, onChange, autoStart } = opts

    const posMv = useMotionValue(0)
    const frameMv = useTransform(posMv, (frame) => Math.floor(frame * nFrames))

    useMotionValueEvent(frameMv, "change", (frame) => {
        onChange?.(frame)
    })

    const animationRef = useRef<AnimationPlaybackControlsWithThen | null>(null)

    useEffect(() => {
        animationRef.current = animate(posMv, [0, 1], {
            duration: nFrames / fps,
            repeat: Infinity,
            repeatType: "loop",
            ease: "linear",
            autoplay: autoStart,
        })
    }, [autoStart, fps, posMv, nFrames])

    const controls = useMemo(
        () => ({
            pause: () => {
                animationRef.current?.pause()
            },
            play: () => {
                animationRef.current?.play()
            },
            togglePlayPause: () => {
                console.log(animationRef.current)
                if (animationRef.current?.state === "running") animationRef.current?.pause()
                else animationRef.current?.play()
            },
            seek: (pos: number) => {
                if (animationRef.current) animationRef.current.time = (pos * nFrames) / fps
            },
            posMv,
            frameMv,
        }),
        [frameMv, posMv, fps, nFrames],
    )

    return controls
}
