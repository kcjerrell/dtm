import { useCallback, useEffect, useRef } from "react"
import type { Snapshot } from "valtio"
import { compareBrightness, compareColor, compareDifference } from "./compareImages"
import type { ImageCompareHooksContextType } from "./hooks"
import type { ImageCompareState, SliderEffect } from "./state"

type ComparisonRefs = Pick<
    ImageCompareHooksContextType["refs"],
    "imgARef" | "imgBRef" | "offscreenCanvasRef"
>
type ComparisonKey = (string | number | boolean | undefined)[]

/** Owns the expensive image-space buffer independently of viewport pan/zoom copies. */
export function useSliderComparison(
    state: ImageCompareState,
    snap: Snapshot<ImageCompareState>,
    refs: ComparisonRefs,
    onGenerated: (effect: SliderEffect) => void,
) {
    const lastGenerated = useRef<ComparisonKey | null>(null)

    const generate = useCallback(() => {
        if (state.mode !== "slider") return
        const effect = state.sliderTrail
        if (effect === "none") {
            lastGenerated.current = null
            state.canvasContents = "none"
            onGenerated("none")
            return
        }

        const imageA = refs.imgARef.current
        const imageB = refs.imgBRef.current
        const loaded = (image: HTMLImageElement | null, src?: string) =>
            image &&
            src &&
            image.getAttribute("src") === src &&
            image.complete &&
            image.naturalWidth > 0 &&
            image.naturalHeight > 0
        if (
            !loaded(imageA, state.imageASrc) ||
            !loaded(imageB, state.imageBSrc) ||
            !imageA ||
            !imageB ||
            !state.imageAWidth ||
            !state.imageAHeight ||
            !state.imageBWidth ||
            !state.imageBHeight
        )
            return

        const key: ComparisonKey = [
            state.imageASrc,
            state.imageBSrc,
            imageA.naturalWidth,
            imageA.naturalHeight,
            imageB.naturalWidth,
            imageB.naturalHeight,
            state.imageBOffset.x,
            state.imageBOffset.y,
            state.imageBScaleX,
            state.imageBScaleY,
            state.smoothing,
            effect,
            state.sliderThreshold,
            state.sliderGain,
        ]
        const canvas = refs.offscreenCanvasRef.current ?? document.createElement("canvas")
        if (
            state.canvasContents === effect &&
            canvas.width > 0 &&
            canvas.height > 0 &&
            lastGenerated.current?.every((value, index) => value === key[index])
        )
            return

        refs.offscreenCanvasRef.current = canvas
        try {
            const compare =
                effect === "brightness"
                    ? compareBrightness
                    : effect === "color"
                      ? compareColor
                      : compareDifference
            compare(imageA, imageB, canvas, {
                imageBOffset: state.imageBOffset,
                imageBScaleX: state.imageBScaleX,
                imageBScaleY: state.imageBScaleY,
                smoothing: state.smoothing,
                gain: state.sliderGain,
                threshold: state.sliderThreshold,
            })
            lastGenerated.current = key
            state.canvasContents = effect
            onGenerated(effect)
        } catch (error) {
            lastGenerated.current = null
            state.canvasContents = "none"
            onGenerated("none")
            console.error("Failed to generate image comparison", error)
        }
    }, [onGenerated, refs, state])

    // Snapshot dependencies trigger reads from the current mutable state. Gain/threshold
    // changes are requested by the existing debounced controls instead of this effect.
    // biome-ignore lint/correctness/useExhaustiveDependencies: snapshot values intentionally trigger current proxy reads
    useEffect(() => {
        generate()
    }, [
        generate,
        snap.mode,
        snap.imageASrc,
        snap.imageBSrc,
        snap.imageAWidth,
        snap.imageAHeight,
        snap.imageBWidth,
        snap.imageBHeight,
        snap.imageBOffset.x,
        snap.imageBOffset.y,
        snap.imageBScaleX,
        snap.imageBScaleY,
        snap.smoothing,
        snap.sliderTrail,
    ])

    useEffect(() => {
        // A sibling mode may report B's dimensions before the canonical image loads.
        // Listen as well as observing dimensions, including same-sized replacements.
        const imageA = refs.imgARef.current
        const imageB = refs.imgBRef.current
        imageA?.addEventListener("load", generate)
        imageB?.addEventListener("load", generate)
        return () => {
            imageA?.removeEventListener("load", generate)
            imageB?.removeEventListener("load", generate)
        }
    }, [generate, refs])

    return generate
}
