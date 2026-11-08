import { Box } from "@chakra-ui/react"
import { motion, useTransform } from "motion/react"
import {
    type CSSProperties,
    type KeyboardEvent,
    type PointerEvent,
    useEffect,
    useId,
    useRef,
} from "react"
import IconButton from "../IconButton"
import AlignmentPanel from "./AlignmentPanel"
import {
    type AlignmentHandle,
    type AlignmentPin,
    type AlignmentRect,
    alignAroundPin,
    getAlignmentScreenGeometry,
    resizeAlignment,
} from "./alignmentGeometry"
import { ToolbarSection } from "./common"
import { applyEdgeMask } from "./edgeMask"
import {
    type ImageCompareMode,
    type ModeButtonProps,
    type ModeSettingProps,
    type ModeViewProps,
    useImageCompareHooks,
} from "./hooks"
import {
    AlignBEdges,
    AlignBothEdges,
    AlignCompare,
    AlignmentPinMarker,
    AlignOriginal,
} from "./icons"
import { getComparisonGeometry, getComparisonImageStyle } from "./imageGeometry"
import { ImageCompareContext } from "./state"

interface Gesture {
    pointerId: number
    target: HTMLDivElement
    handle?: AlignmentHandle
    startX: number
    startY: number
    rect: AlignmentRect
    pixelsPerA: number
    offset: { x: number; y: number }
    scaleX: number
    scaleY: number
    pinned?: {
        pin: AlignmentPin
        grabbed: AlignmentPin
        sensitivity: { x: number; y: number }
    }
}

const RESIZE_HANDLES = [
    { handle: "nw", name: "top left", left: 0, top: 0, cursor: "nwse-resize" },
    { handle: "n", name: "top", left: "50%", top: 0, marginLeft: -6, cursor: "ns-resize" },
    { handle: "ne", name: "top right", right: 0, top: 0, cursor: "nesw-resize" },
    { handle: "e", name: "right", right: 0, top: "50%", marginTop: -6, cursor: "ew-resize" },
    { handle: "se", name: "bottom right", right: 0, bottom: 0, cursor: "nwse-resize" },
    { handle: "s", name: "bottom", left: "50%", bottom: 0, marginLeft: -6, cursor: "ns-resize" },
    { handle: "sw", name: "bottom left", left: 0, bottom: 0, cursor: "nesw-resize" },
    { handle: "w", name: "left", left: 0, top: "50%", marginTop: -6, cursor: "ew-resize" },
] as const

const AXIS_DAMPING_RATIO = 0.25

// White edges become #ffa0a0 / #a0c8ff without regenerating the raster buffers.
const EDGE_FILTERS = {
    A: "1 0 0 0 0  0 0.627451 0 0 0  0 0 0.627451 0 0  0 0 0 1 0",
    B: "0.627451 0 0 0 0  0 0.784314 0 0 0  0 0 1 0 0  0 0 0 1 0",
} as const

const DISPLAY_MODES = [
    { value: "original", label: "Show original images", Icon: AlignOriginal },
    { value: "b-edges", label: "Show B edges", Icon: AlignBEdges },
    { value: "both-edges", label: "Show A and B edges", Icon: AlignBothEdges },
] as const

function AlignmentEdges({ image: side, style }: { image: "A" | "B"; style: CSSProperties }) {
    const [state, snap] = ImageCompareContext.useContext()
    const { refs } = useImageCompareHooks()
    const imageRef = side === "A" ? refs.imgARef : refs.imgBRef
    const srcKey = side === "A" ? "imageASrc" : "imageBSrc"
    const src = snap[srcKey]
    const edgeCanvas = useRef<HTMLCanvasElement>(null)
    const edgeSource = useRef<{
        src: string
        width: number
        height: number
        naturalWidth: number
        naturalHeight: number
    } | null>(null)

    // biome-ignore lint/correctness/useExhaustiveDependencies: snapshot dependencies trigger current state reads; placement and zoom reuse the buffer
    useEffect(() => {
        const image = imageRef.current
        const clear = () => {
            edgeSource.current = null
            if (edgeCanvas.current) {
                edgeCanvas.current.width = 0
                edgeCanvas.current.height = 0
            }
        }
        const update = () => {
            const canvas = edgeCanvas.current
            const src = state[srcKey]
            if (edgeSource.current?.src !== src) clear()
            if (
                !canvas ||
                !image ||
                !src ||
                state.mode !== "align" ||
                state.alignDisplay === "original" ||
                (side === "A" && state.alignDisplay !== "both-edges") ||
                image.getAttribute("src") !== src ||
                !image.complete ||
                !image.naturalWidth ||
                !image.naturalHeight
            )
                return
            // Detect both maps on the same fitted pixel grid, independently of
            // manual alignment and viewport zoom, so their edge widths match.
            const geometry = getComparisonGeometry({
                imageAWidth: state.imageAWidth,
                imageAHeight: state.imageAHeight,
                imageBWidth: state.imageBWidth,
                imageBHeight: state.imageBHeight,
            })
            const fitted = side === "A" ? geometry.a : geometry.b
            const width = Math.max(1, Math.round(fitted.width))
            const height = Math.max(1, Math.round(fitted.height))
            if (
                edgeSource.current?.src === src &&
                edgeSource.current.width === width &&
                edgeSource.current.height === height &&
                edgeSource.current.naturalWidth === image.naturalWidth &&
                edgeSource.current.naturalHeight === image.naturalHeight
            )
                return
            try {
                canvas.width = width
                canvas.height = height
                const context = canvas.getContext("2d", { willReadFrequently: true })
                if (!context) throw new Error("Could not get a 2D context for alignment edges")
                context.imageSmoothingEnabled = true
                context.imageSmoothingQuality = "high"
                context.drawImage(image, 0, 0, width, height)
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
                applyEdgeMask(
                    pixels,
                    Math.min(width / image.naturalWidth, height / image.naturalHeight),
                )
                context.putImageData(pixels, 0, 0)
                edgeSource.current = {
                    src,
                    width,
                    height,
                    naturalWidth: image.naturalWidth,
                    naturalHeight: image.naturalHeight,
                }
            } catch (error) {
                clear()
                console.error(`Failed to generate image ${side} alignment edges`, error)
            }
        }
        update()
        image?.addEventListener("load", update)
        image?.addEventListener("error", clear)
        return () => {
            image?.removeEventListener("load", update)
            image?.removeEventListener("error", clear)
        }
    }, [
        state,
        imageRef,
        srcKey,
        side,
        snap.mode,
        snap.alignDisplay,
        src,
        snap.imageAWidth,
        snap.imageAHeight,
        snap.imageBWidth,
        snap.imageBHeight,
    ])

    return (
        <canvas
            ref={edgeCanvas}
            role="img"
            aria-label={`${side} edges`}
            style={{ imageRendering: "pixelated", pointerEvents: "none", ...style }}
        />
    )
}

function View({ containerStyle }: ModeViewProps<never>) {
    const [state, snap] = ImageCompareContext.useContext()
    const { zoomStyle, refs } = useImageCompareHooks()
    const gesture = useRef<Gesture | null>(null)
    const outline = useRef<HTMLDivElement>(null)
    const filterId = useId()
    const showOriginal = snap.alignDisplay === "original"
    const showBothEdges = snap.alignDisplay === "both-edges"
    const bStyle: CSSProperties = {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        maxWidth: "none",
        pointerEvents: "none",
        transform: `scale(${snap.imageBScaleX < 0 ? -1 : 1}, ${snap.imageBScaleY < 0 ? -1 : 1})`,
    }
    const ready =
        !!snap.imageASrc &&
        !!snap.imageBSrc &&
        snap.imageAWidth > 0 &&
        snap.imageAHeight > 0 &&
        snap.imageBWidth > 0 &&
        snap.imageBHeight > 0
    const screen = useTransform(() =>
        getAlignmentScreenGeometry(snap, {
            x: zoomStyle.x.get(),
            y: zoomStyle.y.get(),
            scale: zoomStyle.scale.get(),
        }),
    )
    const left = useTransform(screen, (value) => value.rect.x)
    const top = useTransform(screen, (value) => value.rect.y)
    const width = useTransform(screen, (value) => value.rect.width)
    const height = useTransform(screen, (value) => value.rect.height)
    const pinLeft = useTransform(
        screen,
        (value) => value.a.x + (snap.pinState?.ax ?? 0) * value.pixelsPerA,
    )
    const pinTop = useTransform(
        screen,
        (value) => value.a.y + (snap.pinState?.ay ?? 0) * value.pixelsPerA,
    )

    // biome-ignore lint/correctness/useExhaustiveDependencies: end gestures when the active mode or image pair changes
    useEffect(() => {
        return () => {
            const current = gesture.current
            gesture.current = null
            if (current?.target.hasPointerCapture(current.pointerId)) {
                current.target.releasePointerCapture(current.pointerId)
            }
        }
    }, [
        snap.mode,
        snap.imageASrc,
        snap.imageBSrc,
        snap.viewportWidth,
        snap.viewportHeight,
        snap.alignPinEnabled,
        snap.pinState,
    ])

    useEffect(() => {
        const viewport = refs.viewportRef.current
        const endForZoom = () => {
            const current = gesture.current
            gesture.current = null
            if (current?.target.hasPointerCapture(current.pointerId)) {
                current.target.releasePointerCapture(current.pointerId)
            }
        }
        // Release the alignment gesture before the viewport handles a wheel zoom.
        viewport?.addEventListener("wheel", endForZoom, { capture: true })
        return () => viewport?.removeEventListener("wheel", endForZoom, { capture: true })
    }, [refs])

    const currentGeometry = () =>
        getAlignmentScreenGeometry(state, {
            x: zoomStyle.x.get(),
            y: zoomStyle.y.get(),
            scale: zoomStyle.scale.get(),
        })
    const applyResize = (
        start: Pick<Gesture, "rect" | "scaleX" | "scaleY" | "offset" | "pixelsPerA">,
        handle: AlignmentHandle,
        dx: number,
        dy: number,
    ) => {
        const viewport = refs.viewportRef.current
        const { rect, pixelsPerA } = start
        if (!viewport || pixelsPerA <= 0 || !rect.width || !rect.height) return
        const next = resizeAlignment(
            rect,
            handle,
            { x: dx, y: dy },
            { width: viewport.clientWidth, height: viewport.clientHeight },
        )
        state.imageBScaleX = start.scaleX * (next.width / rect.width)
        state.imageBScaleY = start.scaleY * (next.height / rect.height)
        state.imageBOffset = {
            x: start.offset.x + (next.x - rect.x + (next.width - rect.width) / 2) / pixelsPerA,
            y: start.offset.y + (next.y - rect.y + (next.height - rect.height) / 2) / pixelsPerA,
        }
    }
    const startGesture = (event: PointerEvent<HTMLElement>, handle?: AlignmentHandle) => {
        const target = outline.current
        if (event.button !== 0 || event.shiftKey || !target) return
        event.preventDefault()
        event.stopPropagation()
        if (gesture.current) return
        const geometry = currentGeometry()
        if (geometry.pixelsPerA <= 0) return
        const viewport = refs.viewportRef.current?.getBoundingClientRect()
        if (!viewport) return
        const x = event.clientX - viewport.left
        const y = event.clientY - viewport.top
        const point = {
            ax: (x - geometry.a.x) / geometry.pixelsPerA,
            ay: (y - geometry.a.y) / geometry.pixelsPerA,
            bx: geometry.b.width
                ? ((x - geometry.b.x) / geometry.b.width) * state.imageBWidth
                : (state.pinState?.bx ?? 0),
            by: geometry.b.height
                ? ((y - geometry.b.y) / geometry.b.height) * state.imageBHeight
                : (state.pinState?.by ?? 0),
        }
        if (state.alignPinEnabled && !state.pinState) {
            // A collapsed image has no unique inverse coordinate; use Values or Reset first.
            if (geometry.b.width && geometry.b.height) state.pinState = point
            return
        }
        const pin = state.alignPinEnabled ? state.pinState : null
        let pinned: Gesture["pinned"]
        if (pin) {
            const distanceX = Math.abs(point.ax - pin.ax)
            const distanceY = Math.abs(point.ay - pin.ay)
            if (distanceX === 0 && distanceY === 0) return
            const thresholdX = distanceY * AXIS_DAMPING_RATIO
            const thresholdY = distanceX * AXIS_DAMPING_RATIO
            // A short starting distance makes scale on that axis sensitive to pointer jitter.
            pinned = {
                pin: { ...pin },
                grabbed: point,
                sensitivity: {
                    x: distanceX < thresholdX ? distanceX / thresholdX : 1,
                    y: distanceY < thresholdY ? distanceY / thresholdY : 1,
                },
            }
        }
        event.currentTarget.focus({ preventScroll: true })
        target.setPointerCapture(event.pointerId)
        gesture.current = {
            pointerId: event.pointerId,
            target,
            handle,
            startX: event.clientX,
            startY: event.clientY,
            rect: geometry.rect,
            pixelsPerA: geometry.pixelsPerA,
            offset: { ...state.imageBOffset },
            scaleX: state.imageBScaleX,
            scaleY: state.imageBScaleY,
            pinned,
        }
    }
    const moveGesture = (event: PointerEvent) => {
        const start = gesture.current
        if (!start || event.pointerId !== start.pointerId) return
        if (event.shiftKey) {
            endGesture(event)
            return
        }
        event.stopPropagation()
        const dx = event.clientX - start.startX
        const dy = event.clientY - start.startY
        if (start.pinned) {
            const viewport = refs.viewportRef.current?.getBoundingClientRect()
            if (!viewport) return
            const geometry = currentGeometry()
            const { pin, grabbed, sensitivity } = start.pinned
            const pointerX = (event.clientX - viewport.left - geometry.a.x) / geometry.pixelsPerA
            const pointerY = (event.clientY - viewport.top - geometry.a.y) / geometry.pixelsPerA
            const next = alignAroundPin(state, pin, grabbed, {
                ax: grabbed.ax + (pointerX - grabbed.ax) * sensitivity.x,
                ay: grabbed.ay + (pointerY - grabbed.ay) * sensitivity.y,
            })
            if (
                [
                    next.imageBScaleX,
                    next.imageBScaleY,
                    next.imageBOffset.x,
                    next.imageBOffset.y,
                ].every(Number.isFinite)
            )
                Object.assign(state, next)
        } else if (start.handle) {
            applyResize(start, start.handle, dx, dy)
        } else
            state.imageBOffset = {
                x: start.offset.x + dx / start.pixelsPerA,
                y: start.offset.y + dy / start.pixelsPerA,
            }
    }
    const endGesture = (event: PointerEvent) => {
        const start = gesture.current
        if (!start || event.pointerId !== start.pointerId) return
        event.stopPropagation()
        gesture.current = null
        if (start.target.hasPointerCapture(event.pointerId))
            start.target.releasePointerCapture(event.pointerId)
    }
    const keyAdjust = (event: KeyboardEvent, handle?: AlignmentHandle) => {
        const directions: Record<string, [number, number]> = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
        }
        const direction = directions[event.key]
        if (!direction) return
        event.preventDefault()
        event.stopPropagation()
        if (state.alignPinEnabled) return
        const amount = event.shiftKey ? 10 : 1
        if (handle) {
            applyResize(
                {
                    ...currentGeometry(),
                    scaleX: state.imageBScaleX,
                    scaleY: state.imageBScaleY,
                    offset: { ...state.imageBOffset },
                },
                handle,
                direction[0] * amount,
                direction[1] * amount,
            )
        } else {
            state.imageBOffset.x += direction[0] * amount
            state.imageBOffset.y += direction[1] * amount
        }
    }

    return (
        <Box
            position="absolute"
            inset={0}
            zIndex={1}
            pointerEvents="none"
            bgColor={showBothEdges ? "black" : undefined}
            isolation="isolate"
            display={snap.mode === "align" && ready ? "block" : "none"}
        >
            <svg width={0} height={0} aria-hidden="true" style={{ position: "absolute" }}>
                <defs>
                    {(["A", "B"] as const).map((side) => (
                        <filter
                            key={side}
                            id={`${filterId}-${side}`}
                            colorInterpolationFilters="sRGB"
                        >
                            <feColorMatrix type="matrix" values={EDGE_FILTERS[side]} />
                        </filter>
                    ))}
                </defs>
            </svg>
            <motion.div style={containerStyle}>
                <AlignmentEdges
                    image="A"
                    style={{
                        ...getComparisonImageStyle(snap, "a"),
                        display: showBothEdges ? "block" : "none",
                        filter: `url(#${filterId}-A)`,
                    }}
                />
            </motion.div>
            <motion.div
                ref={outline}
                role="group"
                tabIndex={0}
                aria-label="Image B alignment"
                data-image-align=""
                style={{
                    position: "absolute",
                    left,
                    top,
                    width,
                    height,
                    outline: snap.alignPinEnabled ? undefined : "1px solid white",
                    boxShadow: snap.alignPinEnabled ? undefined : "0 0 0 2px black",
                    pointerEvents: "auto",
                    cursor: snap.shiftHeld
                        ? "grab"
                        : snap.alignPinEnabled && !snap.pinState
                          ? "crosshair"
                          : "move",
                    touchAction: "none",
                }}
                onPointerDown={(event) => startGesture(event)}
                onPointerMove={moveGesture}
                onPointerUp={endGesture}
                onPointerCancel={endGesture}
                onLostPointerCapture={() => {
                    gesture.current = null
                }}
                onKeyDown={(event) => keyAdjust(event)}
            >
                <img
                    src={snap.imageBSrc}
                    alt="B original"
                    crossOrigin="anonymous"
                    draggable={false}
                    style={{ ...bStyle, display: showOriginal ? "block" : "none", opacity: 0.5 }}
                />
                <AlignmentEdges
                    image="B"
                    style={{
                        ...bStyle,
                        display: showOriginal ? "none" : "block",
                        opacity: showBothEdges ? 1 : 0.8,
                        filter: showBothEdges ? `url(#${filterId}-B)` : "none",
                        mixBlendMode: showBothEdges ? "screen" : "normal",
                    }}
                />
                {!snap.alignPinEnabled &&
                    snap.imageBScaleX !== 0 &&
                    snap.imageBScaleY !== 0 &&
                    RESIZE_HANDLES.map(({ handle, name, cursor, ...position }) => (
                        <button
                            key={handle}
                            type="button"
                            aria-label={`Scale image B from ${name}`}
                            style={{
                                ...position,
                                position: "absolute",
                                width: 12,
                                height: 12,
                                padding: 0,
                                background: "white",
                                border: "1px solid black",
                                cursor: snap.shiftHeld ? "grab" : cursor,
                            }}
                            onPointerDown={(event) => startGesture(event, handle)}
                            onKeyDown={(event) => keyAdjust(event, handle)}
                        />
                    ))}
            </motion.div>
            {snap.alignPinEnabled && snap.pinState && (
                <motion.button
                    type="button"
                    aria-label="Remove alignment pin"
                    title="Remove pin and choose a new anchor"
                    style={{
                        position: "absolute",
                        left: pinLeft,
                        top: pinTop,
                        width: 24,
                        height: 24,
                        padding: 0,
                        marginLeft: -12,
                        marginTop: -12,
                        display: "grid",
                        placeItems: "center",
                        color: "#ffd740",
                        background: "#0009",
                        border: "1px solid currentColor",
                        borderRadius: "50%",
                        pointerEvents: "auto",
                        cursor: snap.shiftHeld ? "grab" : "pointer",
                        touchAction: "none",
                    }}
                    onPointerDown={(event) => {
                        if (!event.shiftKey) event.stopPropagation()
                    }}
                    onClick={(event) => {
                        if (!event.shiftKey) state.pinState = null
                    }}
                >
                    <AlignmentPinMarker size={18} />
                </motion.button>
            )}
        </Box>
    )
}

function Settings(props: ModeSettingProps<never>) {
    const { selfProps: _selfProps, ...rest } = props
    const [state, snap] = ImageCompareContext.useContext()
    return (
        <ToolbarSection
            activeIndex={DISPLAY_MODES.findIndex((m) => m.value === snap.alignDisplay)}
            {...rest}
        >
            {DISPLAY_MODES.map(({ value, label, Icon }) => (
                <IconButton
                    key={value}
                    variant="toolbar"
                    aria-label={label}
                    aria-pressed={snap.alignDisplay === value}
                    tbActive={snap.alignDisplay === value}
                    tipTitle={label}
                    onClick={() => {
                        state.alignDisplay = value
                    }}
                >
                    <Icon />
                </IconButton>
            ))}
            <AlignmentPanel />
            <IconButton
                aria-label="Pin"
                aria-pressed={snap.alignPinEnabled}
                variant="toolbar"
                tbActive={snap.alignPinEnabled}
                tipTitle="Pin alignment"
                tipText="Click B to anchor a point, then drag B to scale around it. Starting close to the pin’s horizontal or vertical line reduces movement across that line. Drag across the pin to flip. Hold Shift to pan."
                px={2}
                aspectRatio="auto"
                disabled={!snap.imageASrc || !snap.imageBSrc}
                onClick={() => {
                    state.alignPinEnabled = !state.alignPinEnabled
                    state.pinState = null
                }}
            >
                Pin
            </IconButton>
            <IconButton
                variant="toolbar"
                aria-label="Reset alignment"
                tipTitle="Reset alignment"
                disabled={!snap.imageBSrc}
                onClick={() => {
                    state.imageBOffset = { x: 0, y: 0 }
                    state.imageBScaleX = 1
                    state.imageBScaleY = 1
                    state.pinState = null
                }}
            >
                Reset
            </IconButton>
        </ToolbarSection>
    )
}

function Button({ selected, ...rest }: ModeButtonProps) {
    return (
        <IconButton
            aria-label="Align"
            tipTitle="Align"
            variant="toolbar"
            tbActive={selected}
            tipText="Drag image B to move it. Drag an edge handle to scale one axis or a corner to keep its proportions. Hold Shift and drag to pan. Arrow keys nudge, with larger steps when you hold Shift."
            {...rest}
        >
            <AlignCompare />
        </IconButton>
    )
}

export default {
    name: "align",
    useMode: () => ({}),
    View,
    Settings,
    Button,
} satisfies ImageCompareMode<never>
