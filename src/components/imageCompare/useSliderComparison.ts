import { useCallback, useEffect, useLayoutEffect, useRef } from "react"
import type { Snapshot } from "valtio"
import { subscribeKey } from "valtio/utils"
import type { ImageCompareHooksContextType } from "./hooks"
import { releaseRaster, renderRaster } from "./raster"
import type { ImageCompareState, SliderEffect } from "./state"

type ComparisonRefs = Pick<
    ImageCompareHooksContextType["refs"],
    "imgARef" | "imgBRef" | "offscreenCanvasRef"
>
type ComparisonKey = NonNullable<ImageCompareState["sliderRasterKey"]>

export function sliderRasterImageKey(state: Snapshot<ImageCompareState>) {
    return JSON.stringify([
        state.imagePairRevision,
        state.imageASrc,
        state.imageBSrc,
        state.imageAWidth,
        state.imageAHeight,
        state.imageBWidth,
        state.imageBHeight,
        state.imageBOffset.x,
        state.imageBOffset.y,
        state.imageBScaleX,
        state.imageBScaleY,
        state.smoothing,
        state.sliderTrail,
    ])
}

export function getCurrentSliderEffect(
    snap: Snapshot<ImageCompareState>,
    currentImageKey = sliderRasterImageKey(snap),
): SliderEffect {
    return snap.sliderRasterKey?.imageKey === currentImageKey ? snap.canvasContents : "none"
}

function matches(previous: Snapshot<ComparisonKey> | null, next: Snapshot<ComparisonKey>) {
    return (
        previous?.imageKey === next.imageKey &&
        previous.gain === next.gain &&
        previous.threshold === next.threshold
    )
}

function sourceReady(
    image: HTMLImageElement | null,
    src: string | undefined,
): image is HTMLImageElement {
    return (
        !!image &&
        !!src &&
        image.getAttribute("src") === src &&
        image.complete &&
        image.naturalWidth > 0 &&
        image.naturalHeight > 0
    )
}

/** Owns the image-space raster independently of viewport pan/zoom copies. */
export function useSliderComparison(
    state: ImageCompareState,
    snap: Snapshot<ImageCompareState>,
    { imgARef, imgBRef, offscreenCanvasRef }: ComparisonRefs,
) {
    const pending = useRef<{ controller: AbortController; key: ComparisonKey } | null>(null)
    const currentImageKey = sliderRasterImageKey(snap)

    const abortPending = useCallback(() => {
        pending.current?.controller.abort()
        pending.current = null
    }, [])

    const clearRaster = useCallback(() => {
        releaseRaster(offscreenCanvasRef.current)
        offscreenCanvasRef.current = null
        state.sliderRasterKey = null
        state.canvasContents = "none"
    }, [offscreenCanvasRef, state])

    const generate = useCallback(() => {
        if (state.mode !== "slider") return
        const effect = state.sliderTrail
        if (effect === "none") {
            abortPending()
            clearRaster()
            return
        }

        const key = {
            imageKey: sliderRasterImageKey(state),
            gain: state.sliderGain,
            threshold: state.sliderThreshold,
        }
        if (matches(pending.current?.key ?? null, key)) return
        abortPending()

        if (
            state.canvasContents === effect &&
            offscreenCanvasRef.current &&
            matches(state.sliderRasterKey, key)
        )
            return

        const imageA = imgARef.current
        const imageB = imgBRef.current
        if (!sourceReady(imageA, state.imageASrc) || !sourceReady(imageB, state.imageBSrc)) return

        const controller = new AbortController()
        pending.current = { controller, key }
        const isCurrent = () =>
            !controller.signal.aborted &&
            state.mode === "slider" &&
            sliderRasterImageKey(state) === key.imageKey &&
            state.sliderGain === key.gain &&
            state.sliderThreshold === key.threshold

        void renderRaster(
            {
                kind: "slider",
                effect,
                imageA,
                imageB,
                options: {
                    imageBOffset: { x: state.imageBOffset.x, y: state.imageBOffset.y },
                    imageBScaleX: state.imageBScaleX,
                    imageBScaleY: state.imageBScaleY,
                    smoothing: state.smoothing,
                    gain: key.gain,
                    threshold: key.threshold,
                },
            },
            controller.signal,
        )
            .then((raster) => {
                if (!isCurrent()) {
                    releaseRaster(raster)
                    return
                }
                releaseRaster(offscreenCanvasRef.current)
                offscreenCanvasRef.current = raster
                state.sliderRasterKey = key
                state.canvasContents = effect
            })
            .catch((error) => {
                if (!isCurrent()) return
                clearRaster()
                console.error("Failed to generate image comparison", error)
            })
            .finally(() => {
                if (pending.current?.controller === controller) pending.current = null
            })
    }, [abortPending, clearRaster, imgARef, imgBRef, offscreenCanvasRef, state])

    useLayoutEffect(() => {
        if (snap.mode === "slider") return abortPending
    }, [abortPending, snap.mode])

    useEffect(() => {
        if (snap.mode !== "slider") return

        const imageA = imgARef.current
        const imageB = imgBRef.current
        imageA?.addEventListener("load", generate)
        imageB?.addEventListener("load", generate)

        let timer: ReturnType<typeof setTimeout> | undefined
        const scheduleParameters = () => {
            abortPending()
            clearTimeout(timer)
            timer = setTimeout(generate, 500)
        }
        const unsubscribeGain = subscribeKey(state, "sliderGain", scheduleParameters, true)
        const unsubscribeThreshold = subscribeKey(
            state,
            "sliderThreshold",
            scheduleParameters,
            true,
        )

        return () => {
            imageA?.removeEventListener("load", generate)
            imageB?.removeEventListener("load", generate)
            unsubscribeGain()
            unsubscribeThreshold()
            clearTimeout(timer)
        }
    }, [abortPending, generate, imgARef, imgBRef, snap.mode, state])

    // Snapshot changes trigger reads of the latest mutable inputs. Reconnecting this
    // effect also handles a reveal after a load event fired while Slider was hidden.
    // biome-ignore lint/correctness/useExhaustiveDependencies: revision, sources, and render settings are represented by currentImageKey
    useEffect(() => {
        generate()
    }, [generate, currentImageKey, snap.mode])

    return { displayedEffect: getCurrentSliderEffect(snap, currentImageKey), generate }
}
