import {
    type MotionProps,
    type MotionStyle,
    type MotionValue,
    type SpringOptions,
    useMotionValue,
    useSpring,
    useTransform,
} from "motion/react"
import {
    createContext,
    type RefObject,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
} from "react"
import type { Snapshot } from "valtio"
import { useZoomable } from "@/components/preview/useZoomable"
import type { ToolbarButtonProps } from "../toolbar/ToolbarButton"
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
const ZOOM_OUT_MARGIN = 20

export type UseModeResult<T = unknown> = {
    rootProps?: ChakraProps
    selfProps?: T
    keyHandlers?: Record<"space", () => void>
}
export type ModeButtonProps = Omit<ToolbarButtonProps, "itemId">
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
    setImage: (side: "A" | "B", src: string | undefined) => Promise<void>
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
    const sbsViewportSize = useMemo(
        () => ({
            width: snap.viewportWidth / (snap.sbsLayout === "vertical" ? 2 : 1),
            height: snap.viewportHeight / (snap.sbsLayout === "horizontal" ? 2 : 1),
        }),
        [snap.sbsLayout, snap.viewportHeight, snap.viewportWidth],
    )
    const mapSbsZoomPoint = useCallback((clientX: number, clientY: number) => {
        const paneA = sbsPaneARef.current?.getBoundingClientRect()
        const paneB = sbsPaneBRef.current?.getBoundingClientRect()

        if (
            paneA &&
            paneB &&
            paneB.width > 0 &&
            paneB.height > 0 &&
            clientX >= paneB.left &&
            clientX <= paneB.right &&
            clientY >= paneB.top &&
            clientY <= paneB.bottom
        ) {
            return {
                clientX: paneA.left + ((clientX - paneB.left) / paneB.width) * paneA.width,
                clientY: paneA.top + ((clientY - paneB.top) / paneB.height) * paneA.height,
            }
        }
        return { clientX, clientY }
    }, [])
    const zoomViewportSize =
        snap.mode === "sbs"
            ? sbsViewportSize
            : { width: snap.viewportWidth, height: snap.viewportHeight }
    const { handlers: zoomHandlers, style: zoomStyle } = useZoomable(viewportRef, {
        contentSize,
        contentOffset,
        viewportSize: snap.mode === "sbs" ? sbsViewportSize : undefined,
        mapZoomPoint: snap.mode === "sbs" ? mapSbsZoomPoint : undefined,
        allowShiftDrag: snap.mode === "align",
        panMargin: ZOOM_OUT_MARGIN,
        // Leave room to inspect the edges, using the individual pane bounds in SBS.
        minZoom:
            contentSize.width > 0 && contentSize.height > 0
                ? Math.min(
                      1,
                      Math.max(1, zoomViewportSize.width - 2 * ZOOM_OUT_MARGIN) / contentSize.width,
                      Math.max(1, zoomViewportSize.height - 2 * ZOOM_OUT_MARGIN) /
                          contentSize.height,
                  )
                : 1,
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

    const loadImageGen = useRef({ A: 0, B: 0 })
    const setImage = useCallback(
        async (side: "A" | "B", src: string | undefined) => {
            const [srcKey, wKey, hKey] = imgKeys(side)

            const loadGen = ++loadImageGen.current[side]

            const changed = src !== state[srcKey]
            if (!changed) return

            const [w, h] = (await preloadImage(src)) ?? [512, 512]

            if (loadGen !== loadImageGen.current[side]) return

            // set loaded image state
            state[srcKey] = src
            state[wKey] = w
            state[hKey] = h

            // reset shared state
            state.imageBOffset = { x: 0, y: 0 }
            state.imageBScaleX = 1
            state.imageBScaleY = 1
            state.pinState = null

            // Comparison pixels and alignment belong to the previous pair
            state.canvasContents = "none"
            for (const canvas of [
                offscreenCanvasRef.current,
                normalCanvasRef.current,
                invertedCanvasRef.current,
            ]) {
                if (canvas) {
                    canvas.width = 0
                    canvas.height = 0
                }
            }
        },
        [state],
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
            setImage,
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
            setImage,
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

const imgKeys = (side: "A" | "B") =>
    [
        `image${side}Src` as "imageASrc" | "imageBSrc",
        `image${side}Width` as "imageAWidth" | "imageBWidth",
        `image${side}Height` as "imageAHeight" | "imageBHeight",
    ] as const

async function preloadImage(src: string | undefined) {
    if (!src) return

    const preload = new Image()
    preload.src = src
    await preload.decode()
    return [preload.naturalWidth, preload.naturalHeight] as const
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
