import { Box } from "@chakra-ui/react"
import { motion, useTransform } from "motion/react"
import { type KeyboardEvent, type PointerEvent, useEffect, useRef } from "react"
import { LuCrosshair, LuMove } from "react-icons/lu"
import IconButton from "../IconButton"
import { Slider } from "../ui/slider"
import AlignmentPanel from "./AlignmentPanel"
import {
    type AlignmentCorner,
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
import { ImageCompareContext } from "./state"

const CORNERS = [
    { corner: "nw", name: "top left", left: 0, top: 0, cursor: "nwse-resize" },
    { corner: "ne", name: "top right", right: 0, top: 0, cursor: "nesw-resize" },
    { corner: "sw", name: "bottom left", left: 0, bottom: 0, cursor: "nesw-resize" },
    { corner: "se", name: "bottom right", right: 0, bottom: 0, cursor: "nwse-resize" },
] as const

interface Gesture {
    pointerId: number
    target: HTMLDivElement
    corner?: AlignmentCorner
    startX: number
    startY: number
    rect: AlignmentRect
    pixelsPerA: number
    offset: { x: number; y: number }
    scaleX: number
    scaleY: number
    pinned?: { pin: AlignmentPin; dragged: { bx: number; by: number } }
}

function View(_props: ModeViewProps<never>) {
    const [state, snap] = ImageCompareContext.useContext()
    const { zoomStyle, refs } = useImageCompareHooks()
    const gesture = useRef<Gesture | null>(null)
    const outline = useRef<HTMLDivElement>(null)
    const edgeCanvas = useRef<HTMLCanvasElement>(null)
    const edgeSource = useRef<{ src: string; width: number; height: number } | null>(null)

    // biome-ignore lint/correctness/useExhaustiveDependencies: snapshot dependencies trigger current state reads; placement and zoom reuse the buffer
    useEffect(() => {
        const image = refs.imgBRef.current
        const clear = () => {
            edgeSource.current = null
            if (edgeCanvas.current) {
                edgeCanvas.current.width = 0
                edgeCanvas.current.height = 0
            }
        }
        const update = () => {
            const canvas = edgeCanvas.current
            const src = state.imageBSrc
            if (edgeSource.current?.src !== src) clear()
            if (
                !canvas ||
                !image ||
                !src ||
                state.mode !== "align" ||
                image.getAttribute("src") !== src ||
                !image.complete ||
                !image.naturalWidth ||
                !image.naturalHeight
            )
                return
            if (
                edgeSource.current?.src === src &&
                edgeSource.current.width === image.naturalWidth &&
                edgeSource.current.height === image.naturalHeight
            )
                return
            try {
                canvas.width = image.naturalWidth
                canvas.height = image.naturalHeight
                const context = canvas.getContext("2d", { willReadFrequently: true })
                if (!context) throw new Error("Could not get a 2D context for alignment edges")
                context.drawImage(image, 0, 0)
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
                applyEdgeMask(pixels)
                context.putImageData(pixels, 0, 0)
                edgeSource.current = { src, width: canvas.width, height: canvas.height }
            } catch (error) {
                clear()
                console.error("Failed to generate image B alignment edges", error)
            }
        }
        update()
        image?.addEventListener("load", update)
        image?.addEventListener("error", clear)
        return () => {
            image?.removeEventListener("load", update)
            image?.removeEventListener("error", clear)
        }
    }, [state, refs.imgBRef, snap.mode, snap.imageBSrc, snap.imageBWidth, snap.imageBHeight])
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
        corner: AlignmentCorner,
        dx: number,
        dy: number,
    ) => {
        const viewport = refs.viewportRef.current
        if (!viewport || start.pixelsPerA <= 0 || !start.rect.width || !start.rect.height) return
        const next = resizeAlignment(
            start.rect,
            corner,
            { x: dx, y: dy },
            {
                width: viewport.clientWidth,
                height: viewport.clientHeight,
            },
        )
        const factor = next.width / start.rect.width
        state.imageBScaleX = start.scaleX * factor
        state.imageBScaleY = start.scaleY * factor
        state.imageBOffset = {
            x:
                start.offset.x +
                (next.x + next.width / 2 - start.rect.x - start.rect.width / 2) / start.pixelsPerA,
            y:
                start.offset.y +
                (next.y + next.height / 2 - start.rect.y - start.rect.height / 2) /
                    start.pixelsPerA,
        }
    }
    const startGesture = (event: PointerEvent, corner?: AlignmentCorner) => {
        if (event.button !== 0 || !outline.current) return
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
        const target = outline.current
        target.focus({ preventScroll: true })
        target.setPointerCapture(event.pointerId)
        gesture.current = {
            pointerId: event.pointerId,
            target,
            corner,
            startX: event.clientX,
            startY: event.clientY,
            ...geometry,
            offset: { ...state.imageBOffset },
            scaleX: state.imageBScaleX,
            scaleY: state.imageBScaleY,
            pinned:
                state.alignPinEnabled && state.pinState
                    ? { pin: { ...state.pinState }, dragged: { bx: point.bx, by: point.by } }
                    : undefined,
        }
    }
    const moveGesture = (event: PointerEvent) => {
        const start = gesture.current
        if (!start || event.pointerId !== start.pointerId) return
        event.stopPropagation()
        const dx = event.clientX - start.startX
        const dy = event.clientY - start.startY
        if (start.pinned) {
            const viewport = refs.viewportRef.current?.getBoundingClientRect()
            if (!viewport) return
            const geometry = currentGeometry()
            const next = alignAroundPin(state, start.pinned.pin, start.pinned.dragged, {
                ax: (event.clientX - viewport.left - geometry.a.x) / geometry.pixelsPerA,
                ay: (event.clientY - viewport.top - geometry.a.y) / geometry.pixelsPerA,
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
        } else if (start.corner) applyResize(start, start.corner, dx, dy)
        else
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
    const keyAdjust = (event: KeyboardEvent, corner?: AlignmentCorner) => {
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
        if (corner) {
            const geometry = currentGeometry()
            applyResize(
                {
                    ...geometry,
                    scaleX: state.imageBScaleX,
                    scaleY: state.imageBScaleY,
                    offset: { ...state.imageBOffset },
                },
                corner,
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
            display={snap.mode === "align" && ready ? "block" : "none"}
        >
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
                    cursor: snap.alignPinEnabled && !snap.pinState ? "crosshair" : "move",
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
                <canvas
                    ref={edgeCanvas}
                    role="img"
                    aria-label="B edges"
                    style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        maxWidth: "none",
                        opacity: snap.alignOpacity,
                        imageRendering: "pixelated",
                        pointerEvents: "none",
                        transform: `scale(${snap.imageBScaleX < 0 ? -1 : 1}, ${snap.imageBScaleY < 0 ? -1 : 1})`,
                    }}
                />
                {!snap.alignPinEnabled &&
                    CORNERS.map(({ corner, name, cursor, ...position }) => (
                        <button
                            key={corner}
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
                                cursor,
                                touchAction: "none",
                            }}
                            onPointerDown={(event) => startGesture(event, corner)}
                            onKeyDown={(event) => keyAdjust(event, corner)}
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
                        cursor: "pointer",
                        touchAction: "none",
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => {
                        state.pinState = null
                    }}
                >
                    <LuCrosshair size={18} />
                </motion.button>
            )}
        </Box>
    )
}

function Settings(props: ModeSettingProps<never>) {
    const { selfProps: _selfProps, ...rest } = props
    const [state, snap] = ImageCompareContext.useContext()
    return (
        <ToolbarSection {...rest}>
            <AlignmentPanel />
            <IconButton
                aria-label="Pin"
                aria-pressed={snap.alignPinEnabled}
                tone={snap.alignPinEnabled ? "selected" : "none"}
                tipTitle="Pin alignment"
                tipText="Click to anchor a point, then drag elsewhere in B to scale X and Y independently. Drag across the pin to flip an axis."
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
            <Box fontSize="xs" alignSelf="center">
                Opacity
            </Box>
            <Slider
                width="6rem"
                min={0}
                max={1}
                step={0.01}
                aria-label={["Image B opacity"]}
                value={[snap.alignOpacity]}
                onValueChange={({ value }) => {
                    state.alignOpacity = value[0]
                }}
            />
            <IconButton
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
            tone={selected ? "selected" : "none"}
            tipText="Drag image B to align it. Drag a corner to scale it. Arrow keys nudge; hold Shift for larger steps."
            {...rest}
        >
            <LuMove />
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
