import { Box } from "@chakra-ui/react"
import { motion, useTransform } from "motion/react"
import { type KeyboardEvent, type PointerEvent, useEffect, useRef } from "react"
import { LuMove } from "react-icons/lu"
import IconButton from "../IconButton"
import { Slider } from "../ui/slider"
import AlignmentPanel from "./AlignmentPanel"
import {
    type AlignmentCorner,
    type AlignmentRect,
    getAlignmentScreenGeometry,
    resizeAlignment,
} from "./alignmentGeometry"
import { ToolbarSection } from "./common"
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
    scale: number
}

function View(_props: ModeViewProps<never>) {
    const [state, snap] = ImageCompareContext.useContext()
    const { zoomStyle, refs } = useImageCompareHooks()
    const gesture = useRef<Gesture | null>(null)
    const outline = useRef<HTMLDivElement>(null)
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

    // biome-ignore lint/correctness/useExhaustiveDependencies: end gestures when the active mode or image pair changes
    useEffect(() => {
        return () => {
            const current = gesture.current
            gesture.current = null
            if (current?.target.hasPointerCapture(current.pointerId)) {
                current.target.releasePointerCapture(current.pointerId)
            }
        }
    }, [snap.mode, snap.imageASrc, snap.imageBSrc, snap.viewportWidth, snap.viewportHeight])

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
        start: Pick<Gesture, "rect" | "scale" | "offset" | "pixelsPerA">,
        corner: AlignmentCorner,
        dx: number,
        dy: number,
    ) => {
        const viewport = refs.viewportRef.current
        if (!viewport || start.pixelsPerA <= 0) return
        const next = resizeAlignment(
            start.rect,
            corner,
            { x: dx, y: dy },
            {
                width: viewport.clientWidth,
                height: viewport.clientHeight,
            },
        )
        state.imageBScale = (start.scale * next.width) / start.rect.width
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
            scale: state.imageBScale,
        }
    }
    const moveGesture = (event: PointerEvent) => {
        const start = gesture.current
        if (!start || event.pointerId !== start.pointerId) return
        event.stopPropagation()
        const dx = event.clientX - start.startX
        const dy = event.clientY - start.startY
        if (start.corner) applyResize(start, start.corner, dx, dy)
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
        const amount = event.shiftKey ? 10 : 1
        if (corner) {
            const geometry = currentGeometry()
            applyResize(
                { ...geometry, scale: state.imageBScale, offset: { ...state.imageBOffset } },
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
                    outline: "1px solid white",
                    boxShadow: "0 0 0 2px black",
                    pointerEvents: "auto",
                    cursor: "move",
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
                    alt="B"
                    draggable={false}
                    style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        maxWidth: "none",
                        opacity: snap.alignOpacity,
                        pointerEvents: "none",
                    }}
                />
                {CORNERS.map(({ corner, name, cursor, ...position }) => (
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
        </Box>
    )
}

function Settings(props: ModeSettingProps<never>) {
    const { selfProps: _selfProps, ...rest } = props
    const [state, snap] = ImageCompareContext.useContext()
    return (
        <ToolbarSection {...rest}>
            <AlignmentPanel />
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
                    state.imageBScale = 1
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
