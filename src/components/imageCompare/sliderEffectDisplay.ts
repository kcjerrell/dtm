export type SliderEffectDisplay = "trail" | "hidden" | "full"

export type SliderEffectDisplayEvent = "shiftDown" | "shiftUp" | "dragStart" | "dragEnd"

export function transitionSliderEffectDisplay(
    display: SliderEffectDisplay,
    event: SliderEffectDisplayEvent,
    sliderDragging: boolean,
): SliderEffectDisplay {
    if (event === "shiftDown") return sliderDragging ? "hidden" : "full"
    if (event === "shiftUp") return "trail"
    if (event === "dragEnd" && display === "hidden") return "trail"
    return display
}
