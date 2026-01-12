import { type SpringOptions, useSpring } from "motion/react"
import { type RefObject, useCallback, useEffect, useMemo, useRef } from "react"

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
    } = {},
) {
    const { contentSize } = options
    const posRef = useRef({ x: 0, y: 0, scale: 1 })
    const xMv = useSpring(posRef.current.x, SPRING)
    const yMv = useSpring(posRef.current.y, SPRING)
    const scaleMv = useSpring(posRef.current.scale, SPRING)

    const isDragging = useRef(false)
    const lastPos = useRef({ x: 0, y: 0 })
    const hasMoved = useRef(false)

    const setMv = useCallback(() => {
        const { x, y, scale } = posRef.current
        xMv.set(x)
        yMv.set(y)
        scaleMv.set(scale)
    }, [xMv, yMv, scaleMv])

    const clampPos = useCallback(
        (currX: number, currY: number, currScale: number) => {
            if (!contentSize) return { x: currX, y: currY }

            const winW = window.innerWidth
            const winH = window.innerHeight

            // The content's base size (at scale 1) is passed in options.contentSize.
            // But we need to know how it relates to the viewport.
            // Assuming the content is centered and "contained" initially?
            // Wait, standard behavior for this light box is that the image is initially "contain"ed.
            // So contentSize.width <= winW and contentSize.height <= winH.

            const scaledW = contentSize.width * currScale
            const scaledH = contentSize.height * currScale

            // Max offsets allowed
            // If scaled content is larger than viewport, allow panning until edge hits viewport edge.
            // Edge is at: Center + Offset +/- ScaledSize/2
            // Viewport edge: Center +/- ViewportSize/2 (relative to center)

            // We work in center-relative coords for x/y.
            // Left Edge of Image relative to Screen Center: x - scaledW / 2
            // Left Edge of Screen relative to Screen Center: -winW / 2

            // Constraint: Image Left Edge <= Screen Left Edge
            // x - scaledW / 2 <= -winW / 2  =>  x <= (scaledW - winW) / 2

            // Right Edge Constraint: Image Right Edge >= Screen Right Edge
            // x + scaledW / 2 >= winW / 2   =>  x >= (winW - scaledW) / 2
            // => x >= - (scaledW - winW) / 2

            // So |x| <= (scaledW - winW) / 2

            let maxX = 0
            let maxY = 0

            if (scaledW > winW) {
                maxX = (scaledW - winW) / 2
            }
            if (scaledH > winH) {
                maxY = (scaledH - winH) / 2
            }

            return {
                x: Math.min(Math.max(currX, -maxX), maxX),
                y: Math.min(Math.max(currY, -maxY), maxY),
            }
        },
        [contentSize],
    )

    const zoom = useCallback(
        (delta: number, clientX: number, clientY: number) => {
            const { x, y, scale } = posRef.current

            let newScale = scale * (1 - delta * ZOOM_SENSITIVITY)
            newScale = Math.min(Math.max(newScale, MIN_ZOOM), MAX_ZOOM)

            const ratio = newScale / scale

            const cx = window.innerWidth / 2
            const cy = window.innerHeight / 2

            const mouseX = clientX - cx
            const mouseY = clientY - cy

            const newX = mouseX - (mouseX - x) * ratio
            const newY = mouseY - (mouseY - y) * ratio

            const clamped = clampPos(newX, newY, newScale)

            posRef.current = { x: clamped.x, y: clamped.y, scale: newScale }
            setMv()
        },
        [setMv, clampPos],
    )

    useEffect(() => {
        const el = motionRef.current
        if (!el) return

        const onWheel = (e: WheelEvent) => {
            e.preventDefault()
            zoom(e.deltaY, e.clientX, e.clientY)
        }

        el.addEventListener("wheel", onWheel, { passive: false })
        return () => el.removeEventListener("wheel", onWheel)
    }, [motionRef, zoom])

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0) return

        isDragging.current = true
        hasMoved.current = false
        lastPos.current = { x: e.clientX, y: e.clientY }

        const target = e.target as HTMLElement
        target.setPointerCapture(e.pointerId)
    }, [])

    const onPointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (!isDragging.current) return
            e.preventDefault()

            const dx = e.clientX - lastPos.current.x
            const dy = e.clientY - lastPos.current.y

            if (dx !== 0 || dy !== 0) hasMoved.current = true

            lastPos.current = { x: e.clientX, y: e.clientY }

            const nextX = posRef.current.x + dx
            const nextY = posRef.current.y + dy
            const scale = posRef.current.scale

            const clamped = clampPos(nextX, nextY, scale)

            posRef.current.x = clamped.x
            posRef.current.y = clamped.y
            setMv()
        },
        [setMv, clampPos],
    )

    const onPointerUp = useCallback((e: React.PointerEvent) => {
        if (!isDragging.current) return
        isDragging.current = false

        const target = e.target as HTMLElement
        target.releasePointerCapture(e.pointerId)
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
        posRef.current = { x: 0, y: 0, scale: 1 }
        setMv()
    }, [setMv])

    return { handlers, style, reset }
}
