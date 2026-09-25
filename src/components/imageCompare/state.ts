import { buildStateContext } from "@/hooks/buildStateContext"
import { useRef } from "react"
import type { ImageCompareProps } from "."

export type SliderEffect = "brightness" | "color" | "difference" | "none"
export type SbsLayout = "horizontal" | "vertical"

export type ImageCompareState = {
    /** the url for image a */
    imageASrc?: string
    /** the url for image b */
    imageBSrc?: string

    /** The active comparison mode: slider, alternate, or side-by-side */
    mode: "slider" | "alt" | "sbs"
    /** The selected slider trail effect */
    sliderTrail: SliderEffect
    /** The slider trail effect currently stored in the canvas */
    canvasContents: SliderEffect
    /** minimum perceptual difference shown by the slider effect */
    sliderThreshold: number
    /** multiplier applied to perceptual differences above the threshold */
    sliderGain: number
    /** true while the slider is currently being dragged */
    sliderDragging: boolean

    /** the value of the speed slider (0 to 10) */
    altSpeedInput: number
    /** the speed at which to alternate between A and B (1 to 10)*/
    altSpeed: number
    /** change the phase of the animation to alternate between images when paused */
    altPhase: 0.0 | 0.5

    /** arrange side-by-side images in a row or column */
    sbsLayout: SbsLayout

    /** whether or not the shift key is behind held down */
    shiftHeld: boolean

    /** state for zoom/pan and canvas alignment */
    viewportWidth: number
    viewportHeight: number
    viewportPixelRatio: number
    imageAWidth: number
    imageAHeight: number
    imageBWidth: number
    imageBHeight: number

    contentSize: { width: number, height: number },
    contentOffset: { left: number, top: number },
}

export const ImageCompareContext = buildStateContext<ImageCompareState, ImageCompareProps>((props?: ImageCompareProps) => ({
    imageASrc: props?.a,
    imageBSrc: props?.b,
    mode: "slider",
    sliderTrail: "none",
    sliderDragging: false,
    canvasContents: "none",
    sliderThreshold: 0.02,
    sliderGain: 10,
    shiftHeld: false,
    altSpeedInput: 5,
    altSpeed: 5,
    altPhase: 0.0,
    sbsLayout: "horizontal",
    viewportWidth: 0,
    viewportHeight: 0,
    viewportPixelRatio: 1,
    imageAWidth: 0,
    imageAHeight: 0,
    imageBWidth: 0,
    imageBHeight: 0,
    get contentSize() {
        const contentWidth = Math.max(this.imageAWidth, this.imageBWidth)
        const contentHeight = Math.max(this.imageAHeight, this.imageBHeight)
        const viewportHeight = this.viewportHeight
        const viewportWidth = this.viewportWidth

        return containSize(contentWidth, contentHeight, viewportWidth, viewportHeight)
    },
    get contentOffset() {
        const contentLeft = (this.viewportWidth - this.contentSize.width) / 2
        const contentTop = (this.viewportHeight - this.contentSize.height) / 2

        return { left: contentLeft, top: contentTop }
    }
}))

function containSize(
    contentWidth: number,
    contentHeight: number,
    viewportWidth: number,
    viewportHeight: number,
) {
    if (!contentWidth || !contentHeight || !viewportWidth || !viewportHeight) {
        return { width: 0, height: 0 }
    }

    const scale = Math.min(viewportWidth / contentWidth, viewportHeight / contentHeight)
    return { width: contentWidth * scale, height: contentHeight * scale }
}
