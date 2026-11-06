import type { SVGProps } from "react"

export { ImBrightnessContrast as BrightnessEffect } from "react-icons/im"
export { IoInvertMode as DifferenceEffect } from "react-icons/io5"
export {
    LuCrosshair as AlignmentPinMarker,
    LuMove as AlignCompare,
    LuStretchHorizontal as HorizontalLayout,
    LuStretchVertical as VerticalLayout,
} from "react-icons/lu"
export {
    MdBlurOff as SmoothingOff,
    MdBlurOn as SmoothingOn,
    MdOutlineColorLens as ColorEffect,
} from "react-icons/md"
export { PiRepeatBold as SwapCompare } from "react-icons/pi"
export { RiLayoutColumnFill as SbsCompare } from "react-icons/ri"
export { TbAdjustmentsHorizontal as SliderSettings } from "react-icons/tb"
export { TfiSplitH as SliderCompare } from "react-icons/tfi"

export function ABCompare(props: SVGProps<SVGSVGElement>) {
    return (
        <svg
            width={"20"}
            height={"20"}
            viewBox={"0 0 20 20"}
            role={"img"}
            aria-label={"A/B comparison"}
            {...props}
        >
            <path
                fill={"currentColor"}
                fillRule={"evenodd"}
                d={`
                    M2 1 H18 A2 2 0 0 1 20 3 V17 A2 2 0 0 1 18 19
                    H2 A2 2 0 0 1 0 17 V3 A2 2 0 0 1 2 1 Z

                    M2.25 2.75 H10 V17.25 H2.25 A.5 .5 0 0 1 1.75 16.75
                    V3.25 A.5 .5 0 0 1 2.25 2.75 Z

                    M4.95 6 H6.8 L9 14 H7.45 L6.95 12.05 H4.8 L4.3 14 H2.75 Z
                    M5.13 10.75 H6.62 L5.875 7.85 Z

                    M12.125 6 H15.2 C16.8 6 17.55 6.8 17.55 8.05
                    C17.55 8.82 17.2 9.38 16.6 9.7
                    C17.43 9.97 17.875 10.68 17.875 11.65
                    C17.875 13.12 16.95 14 15.3 14 H12.125 Z
                    M13.6 7.25 V9.17 H15 C15.7 9.17 16.1 8.83 16.1 8.2
                    C16.1 7.59 15.7 7.25 15 7.25 Z
                    M13.6 10.38 V12.75 H15.15 C15.95 12.75 16.4 12.33 16.4 11.56
                    C16.4 10.8 15.95 10.38 15.15 10.38 Z
            `}
            />
        </svg>
    )
}
