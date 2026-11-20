import { type SpringOptions, useSpring } from "motion/react"
import { type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { useElapsed } from "@/hooks/useDecay"
import { getFlag, updateFlag, useFlag, useSettingRef } from "@/state/settings"
import { toaster } from "../ui/toaster"
import { NotifyPinchToast } from "./toast"

const MIN_ZOOM = 1
const MAX_ZOOM = 8
const ZOOM_SENSITIVITY = 0.002
export const SPRING: SpringOptions = {
    bounce: 0,
    visualDuration: 0.2,
}

export function useZoomable(
    motionRef: RefObject<HTMLElement | null>,
    options: {
        contentSize?: { width: number; height: number }
        contentOffset?: { left: number; top: number }
        viewportSize?: { width: number; height: number }
        zoomViewportRef?: RefObject<HTMLElement | null>
        mapZoomPoint?: (clientX: number, clientY: number) => { clientX: number; clientY: number }
        onZoomOutBoundary?: () => void
        allowShiftDrag?: boolean
        minZoom?: number
        maxZoom?: number
        /** Start at minimum zoom and follow changes to it while fitted. */
        fitAtMinZoom?: boolean
        /** Gap allowed beyond each content edge at 1x zoom, in CSS pixels. */
        panMargin?: number
    } = {},
) {
    const {
        contentSize,
        contentOffset,
        viewportSize,
        zoomViewportRef,
        mapZoomPoint,
        onZoomOutBoundary,
        allowShiftDrag = false,
        minZoom = MIN_ZOOM,
        maxZoom = MAX_ZOOM,
        fitAtMinZoom = false,
        panMargin = 0,
    } = options
    const posRef = useRef({ x: 0, y: 0, scale: fitAtMinZoom ? minZoom : 1 })
    const previousMinZoom = useRef(minZoom)
    const xMv = useSpring(posRef.current.x, SPRING)
    const yMv = useSpring(posRef.current.y, SPRING)
    const scaleMv = useSpring(posRef.current.scale, SPRING)

    const zoomMode = useSettingRef("app.zoomMode")
    const drag = useRef<{ id: number; button: number; x: number; y: number } | null>(null)
    const hasMoved = useRef(false)
    const lastPointer = useRef<{ x: number; y: number } | null>(null)
    const gestureScale = useRef<number | null>(null)

    const getElapsed = useElapsed(true)

    const [flag, _] = useFlag("notifyPinchZoom")
    useEffect(() => {
        if (!flag) {
            queueMicrotask(() => {
                if (getFlag("notifyPinchZoom")) return
                updateFlag("notifyPinchZoom", true)
                toaster.create({
                    title: "Controls have changed",
                    description: NotifyPinchToast(zoomMode.current),
                    closable: true,
                })
            })
        }
    }, [flag, zoomMode])

    const setMv = useCallback(
        (immediate = false) => {
            const { x, y, scale } = posRef.current
            const update = immediate ? "jump" : "set"
            xMv[update](x)
            yMv[update](y)
            scaleMv[update](scale)
        },
        [xMv, yMv, scaleMv],
    )

    const clampPos = useCallback(
        (currX: number, currY: number, currScale: number) => {
            if (!contentSize) return { x: currX, y: currY }

            const viewport = motionRef.current
            const viewportWidth = viewportSize?.width ?? viewport?.clientWidth ?? window.innerWidth
            const viewportHeight =
                viewportSize?.height ?? viewport?.clientHeight ?? window.innerHeight
            const margin = panMargin * currScale

            const clampAxis = (
                position: number,
                contentLength: number,
                viewportLength: number,
                offset: number,
            ) => {
                const scaledLength = contentLength * currScale
                if (
                    (fitAtMinZoom && currScale === minZoom) ||
                    scaledLength + 2 * margin <= viewportLength
                ) {
                    return viewportLength / 2 - (offset + contentLength / 2)
                }

                const scaleOverflow = (scaledLength - contentLength) / 2
                const min = viewportLength - offset - contentLength - scaleOverflow - margin
                const max = -offset + scaleOverflow + margin
                return Math.min(Math.max(position, min), max)
            }

            const contentLeft = contentOffset?.left ?? (viewportWidth - contentSize.width) / 2
            const contentTop = contentOffset?.top ?? (viewportHeight - contentSize.height) / 2

            return {
                x: clampAxis(currX, contentSize.width, viewportWidth, contentLeft),
                y: clampAxis(currY, contentSize.height, viewportHeight, contentTop),
            }
        },
        [contentOffset, contentSize, motionRef, viewportSize, panMargin, fitAtMinZoom, minZoom],
    )

    const pan = useCallback(
        (dx: number, dy: number) => {
            const { x, y, scale } = posRef.current
            const clamped = clampPos(x + dx, y + dy, scale)
            posRef.current = { ...clamped, scale }
            setMv()
        },
        [clampPos, setMv],
    )

    const zoom = useCallback(
        (factor: number, clientX?: number, clientY?: number) => {
            const { x, y, scale } = posRef.current
            const newScale = Math.min(Math.max(scale * factor, minZoom), maxZoom)
            const ratio = newScale / scale

            const viewportRect =
                zoomViewportRef?.current?.getBoundingClientRect() ??
                motionRef.current?.getBoundingClientRect()
            const cx = viewportRect
                ? viewportRect.left + viewportRect.width / 2
                : window.innerWidth / 2
            const cy = viewportRect
                ? viewportRect.top + viewportRect.height / 2
                : window.innerHeight / 2

            const zoomPoint =
                clientX === undefined || clientY === undefined
                    ? { clientX: cx, clientY: cy }
                    : (mapZoomPoint?.(clientX, clientY) ?? { clientX, clientY })
            const mouseX = zoomPoint.clientX - cx
            const mouseY = zoomPoint.clientY - cy

            const newX = mouseX - (mouseX - x) * ratio
            const newY = mouseY - (mouseY - y) * ratio

            const clamped = clampPos(newX, newY, newScale)

            posRef.current = { x: clamped.x, y: clamped.y, scale: newScale }
            setMv()
        },
        [setMv, clampPos, mapZoomPoint, motionRef, minZoom, maxZoom, zoomViewportRef],
    )

    useEffect(() => {
        const el = motionRef.current
        if (!el) return

        const onWheel = (e: WheelEvent) => {
            e.preventDefault()
            if (zoomMode.current === "pinch") {
                if (!e.ctrlKey) {
                    const mode = e.deltaMode
                    const unit = mode === WheelEvent.DOM_DELTA_LINE ? 16 : 1
                    const page = mode === WheelEvent.DOM_DELTA_PAGE
                    pan(
                        -e.deltaX * (page ? el.clientWidth : unit),
                        -e.deltaY * (page ? el.clientHeight : unit),
                    )
                    return
                }
            } else if (e.deltaY > 4 && getElapsed() > 100 && posRef.current.scale === minZoom) {
                onZoomOutBoundary?.()
                return
            }

            const sensitivity = e.ctrlKey ? 2 * ZOOM_SENSITIVITY : ZOOM_SENSITIVITY
            zoom(1 - e.deltaY * sensitivity, e.clientX, e.clientY)
        }

        // macOS WebKit reports trackpad pinches through GestureEvent instead of Ctrl+wheel.
        const onGestureStart = (e: Event) => {
            if (zoomMode.current !== "pinch") return
            e.preventDefault()
            gestureScale.current = 1
        }
        const onGestureChange = (e: Event) => {
            const previous = gestureScale.current
            if (zoomMode.current !== "pinch" || previous === null) return
            e.preventDefault()
            const { scale, clientX, clientY } = e as Event & {
                scale: number
                clientX?: number
                clientY?: number
            }
            if (!Number.isFinite(scale) || scale <= 0) return
            gestureScale.current = scale
            zoom(
                scale / previous,
                clientX ?? lastPointer.current?.x,
                clientY ?? lastPointer.current?.y,
            )
        }
        const onGestureEnd = (e: Event) => {
            if (gestureScale.current === null) return
            e.preventDefault()
            gestureScale.current = null
        }

        el.addEventListener("wheel", onWheel, { passive: false })
        el.addEventListener("gesturestart", onGestureStart, { passive: false })
        el.addEventListener("gesturechange", onGestureChange, { passive: false })
        el.addEventListener("gestureend", onGestureEnd, { passive: false })
        return () => {
            el.removeEventListener("wheel", onWheel)
            el.removeEventListener("gesturestart", onGestureStart)
            el.removeEventListener("gesturechange", onGestureChange)
            el.removeEventListener("gestureend", onGestureEnd)
        }
    }, [getElapsed, minZoom, motionRef, onZoomOutBoundary, pan, zoom, zoomMode])

    useLayoutEffect(() => {
        const { x, y, scale: currentScale } = posRef.current
        const fitted = fitAtMinZoom && currentScale === previousMinZoom.current
        previousMinZoom.current = minZoom
        const scale = fitted ? minZoom : Math.min(Math.max(currentScale, minZoom), maxZoom)
        const clamped = clampPos(x, y, scale)
        posRef.current = { x: clamped.x, y: clamped.y, scale }
        setMv(fitted)
    }, [clampPos, fitAtMinZoom, minZoom, maxZoom, setMv])

    const onPointerDown = useCallback(
        (e: React.PointerEvent) => {
            if (drag.current) return
            if (e.button === 0) hasMoved.current = false
            if (zoomMode.current === "pinch") {
                if (e.button !== 1 && !(e.button === 0 && allowShiftDrag && e.shiftKey)) return
            } else if (e.button !== 0) return

            if (e.button === 1) e.preventDefault()
            drag.current = { id: e.pointerId, button: e.button, x: e.clientX, y: e.clientY }
            e.currentTarget.setPointerCapture(e.pointerId)
        },
        [allowShiftDrag, zoomMode],
    )

    const onPointerMove = useCallback(
        (e: React.PointerEvent) => {
            lastPointer.current = { x: e.clientX, y: e.clientY }
            const current = drag.current
            if (!current || current.id !== e.pointerId) return
            e.preventDefault()

            const dx = e.clientX - current.x
            const dy = e.clientY - current.y
            if (dx === 0 && dy === 0) return
            if (current.button === 0) hasMoved.current = true
            current.x = e.clientX
            current.y = e.clientY
            pan(dx, dy)
        },
        [pan],
    )

    const onPointerUp = useCallback((e: React.PointerEvent) => {
        if (drag.current?.id !== e.pointerId) return
        drag.current = null
        if (e.type !== "pointerup") hasMoved.current = false

        const target = e.currentTarget
        if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId)
    }, [])

    const onClickCapture = useCallback((e: React.MouseEvent) => {
        if (hasMoved.current) {
            e.stopPropagation()
            hasMoved.current = false
        }
    }, [])

    const handlers = useMemo(
        () => ({
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel: onPointerUp,
            onLostPointerCapture: onPointerUp,
            onClickCapture,
        }),
        [onPointerDown, onPointerMove, onPointerUp, onClickCapture],
    )

    const style = useMemo(() => {
        return {
            x: xMv,
            y: yMv,
            scale: scaleMv,
        }
    }, [xMv, yMv, scaleMv])

    const reset = useCallback(() => {
        const scale = fitAtMinZoom ? minZoom : 1
        const position = fitAtMinZoom ? clampPos(0, 0, scale) : { x: 0, y: 0 }
        posRef.current = { ...position, scale }
        setMv()
    }, [clampPos, fitAtMinZoom, minZoom, setMv])

    return { handlers, style, reset }
}
