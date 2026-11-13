import { describe, expect, it } from "vitest"
import {
    type SliderEffectDisplay,
    type SliderEffectDisplayEvent,
    transitionSliderEffectDisplay,
} from "./sliderEffectDisplay"

describe("transitionSliderEffectDisplay", () => {
    it.each<[SliderEffectDisplay, SliderEffectDisplayEvent, boolean, SliderEffectDisplay]>([
        ["trail", "shiftDown", false, "full"],
        ["trail", "shiftDown", true, "hidden"],
        ["full", "dragStart", false, "full"],
        ["full", "dragEnd", true, "full"],
        ["full", "shiftUp", false, "trail"],
        ["full", "shiftUp", true, "trail"],
        ["hidden", "shiftUp", true, "trail"],
        ["hidden", "dragEnd", true, "trail"],
        ["trail", "dragStart", false, "trail"],
        ["trail", "dragEnd", true, "trail"],
    ])("transitions %s on %s (dragging: %s) to %s", (display, event, sliderDragging, expected) => {
        expect(transitionSliderEffectDisplay(display, event, sliderDragging)).toBe(expected)
    })
})
