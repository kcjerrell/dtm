import {
    type MotionProps,
    type MotionStyle,
    type MotionValue,
    type SpringOptions,
    useMotionValue,
    useSpring,
    useTransform,
} from "motion/react"
import { createContext, type RefObject, useContext, useMemo, useRef, useEffect } from "react"
import type { Snapshot } from "valtio"
import { useZoomable } from "@/components/preview/useZoomable"
import type { IconButtonProps } from "../IconButton"
import type { ImageCompareState } from "./state"

const TRAIL_SPRING = {
    stiffness: 20,
    damping: 10,
    mass: 1,
    restDelta: 0.0005,
} as SpringOptions
const MAX_TRAIL_LENGTH = 0.3
const TRAIL_FEATHER_WIDTH = 0.08
const MIN_VISIBLE_TRAIL_LENGTH = 0.002
const TRANSPARENT_MASK = "linear-gradient(to right, transparent, transparent)"

export type UseModeResult<T = unknown> = {
    rootProps?: ChakraProps
    selfProps?: T
    keyHandlers?: Record<"space", () => void>
}
export interface ModeButtonProps extends IconButtonProps {
    selected: boolean
}
export interface ModeViewProps<T = unknown> extends MotionProps {
    containerStyle?: MotionStyle
    selfProps?: T
}
export interface ModeSettingProps<T = unknown> extends ChakraProps {
    selfProps?: T
}
export interface ImageCompareMode<T = unknown> {
    name: string
    useMode: (
        state: ImageCompareState,
        snap: Snapshot<ImageCompareState>,
        hooks: ImageCompareHooksContextType,
    ) => UseModeResult<T>
    Button: React.FC<ModeButtonProps>
    View: React.FC<ModeViewProps<T>>
    Settings: React.FC<ModeSettingProps<T>>
}

export type ImageCompareHooksContextType = {
    refs: {
        imgARef: RefObject<HTMLImageElement | null>
        imgBRef: RefObject<HTMLImageElement | null>
        offscreenCanvasRef: RefObject<HTMLCanvasElement | null>
        normalCanvasRef: RefObject<HTMLCanvasElement | null>
        invertedCanvasRef: RefObject<HTMLCanvasElement | null>
        viewportRef: RefObject<HTMLDivElement | null>
        sbsPaneARef: RefObject<HTMLDivElement | null>
        sbsPaneBRef: RefObject<HTMLDivElement | null>
        dragRef: RefObject<HTMLDivElement | null>
    }
    mv: {
        sliderMv: MotionValue<number>
        dividerXMv: MotionValue<number>
        clipMv: MotionValue<string>
        trailingMv: MotionValue<number>
        normalCanvasMaskMv: MotionValue<string>
        invertedCanvasMaskMv: MotionValue<string>
    }
    zoomHandlers: ReturnType<typeof useZoomable>["handlers"]
    zoomStyle: ReturnType<typeof useZoomable>["style"]
}

const ImageCompareHooksContext = createContext<ImageCompareHooksContextType | undefined>(undefined)

export function useCreateImageCompareContext(
    state: ImageCompareState,
    snap: Snapshot<ImageCompareState>,
) {
    const imgARef = useRef<HTMLImageElement>(null)
    const imgBRef = useRef<HTMLImageElement>(null)
    const offscreenCanvasRef = useRef<HTMLCanvasElement>(null)
    const normalCanvasRef = useRef<HTMLCanvasElement>(null)
    const invertedCanvasRef = useRef<HTMLCanvasElement>(null)
    const viewportRef = useRef<HTMLDivElement>(null)
    const sbsPaneARef = useRef<HTMLDivElement>(null)
    const sbsPaneBRef = useRef<HTMLDivElement>(null)
    const dragRef = useRef<HTMLDivElement>(null)

    const contentSize = useMemo(
        () => ({ width: snap.contentSize.width, height: snap.contentSize.height }),
        [snap.contentSize.height, snap.contentSize.width],
    )
    const contentOffset = useMemo(
        () => ({ left: snap.contentOffset.left, top: snap.contentOffset.top }),
        [snap.contentOffset.left, snap.contentOffset.top],
    )
    const { handlers: zoomHandlers, style: zoomStyle } = useZoomable(viewportRef, {
        contentSize,
        contentOffset,
        maxZoom: 16,
    })

    const sliderMv = useMotionValue(0.5)
    const dividerXMv = useMotionValue(0)
    const clipMv = useTransform(sliderMv, (value) => `inset(0 0 0 ${value * 100}%)`)
    const trailingMv = useSpring(sliderMv, TRAIL_SPRING)
    const normalCanvasMaskMv = useTransform<number, string>(
        [sliderMv, trailingMv],
        ([slider, trailing]) => trailMask(slider, trailing, "right"),
    )
    const invertedCanvasMaskMv = useTransform<number, string>(
        [sliderMv, trailingMv],
        ([slider, trailing]) => trailMask(slider, trailing, "left"),
    )

    const cv = useMemo(
        () => ({
            refs: {
                imgARef,
                imgBRef,
                offscreenCanvasRef,
                normalCanvasRef,
                invertedCanvasRef,
                viewportRef,
                sbsPaneARef,
                sbsPaneBRef,
                dragRef,
            },
            mv: {
                sliderMv,
                dividerXMv,
                clipMv,
                trailingMv,
                normalCanvasMaskMv,
                invertedCanvasMaskMv,
            },
            zoomHandlers,
            zoomStyle,
        }),
        [
            sliderMv,
            trailingMv,
            dividerXMv,
            clipMv,
            normalCanvasMaskMv,
            invertedCanvasMaskMv,
            zoomHandlers,
            zoomStyle,
        ],
    ) as ImageCompareHooksContextType

    useEffect(() => {
        const viewport = cv.refs.viewportRef.current
        if (!viewport) return

        const updateSize = () => {
            const width = viewport.clientWidth
            state.viewportWidth = width
            state.viewportHeight = viewport.clientHeight
            state.viewportPixelRatio = window.devicePixelRatio || 1
            cv.mv.dividerXMv.set((cv.mv.sliderMv.get() - 0.5) * width)
        }
        const observer = new ResizeObserver(updateSize)
        observer.observe(viewport)
        window.addEventListener("resize", updateSize)
        updateSize()

        return () => {
            observer.disconnect()
            window.removeEventListener("resize", updateSize)
        }
    }, [cv, state])

    return [ImageCompareHooksContext, cv] as const
}

export function useImageCompareHooks(): ImageCompareHooksContextType {
    const cv = useContext(ImageCompareHooksContext)
    if (!cv)
        throw new Error("useImageCompareHooks must be used within an ImageCompareHooksProvider")
    return cv
}

function trailMask(sliderPosition: number, trailingPosition: number, direction: "right" | "left") {
    const distance = sliderPosition - trailingPosition
    if (
        Math.abs(distance) < MIN_VISIBLE_TRAIL_LENGTH ||
        (direction === "right" ? distance < 0 : distance > 0)
    ) {
        return TRANSPARENT_MASK
    }

    const slider = Math.min(Math.max(sliderPosition, 0), 1)
    const trailing = Math.min(Math.max(trailingPosition, 0), 1)

    if (direction === "right") {
        const trailStart = Math.max(trailing, slider - MAX_TRAIL_LENGTH)
        const featherEnd = Math.min(slider, trailStart + TRAIL_FEATHER_WIDTH)

        return `linear-gradient(to right,
            transparent 0%,
            transparent ${trailStart * 100}%,
            black ${featherEnd * 100}%,
            black ${slider * 100}%,
            transparent ${slider * 100}%,
            transparent 100%)`
    }

    const trailEnd = Math.min(trailing, slider + MAX_TRAIL_LENGTH)
    const featherStart = Math.max(slider, trailEnd - TRAIL_FEATHER_WIDTH)

    return `linear-gradient(to right,
        transparent 0%,
        transparent ${slider * 100}%,
        black ${slider * 100}%,
        black ${featherStart * 100}%,
        transparent ${trailEnd * 100}%,
        transparent 100%)`
}
