import { type SpringOptions, useMotionValue, useSpring } from "motion/react"
import { RefObject, useEffect, useRef } from "react"

export function useMotionRect(x: number, y: number, width: number, height: number) {
    const mvX = useMotionValue(x)
    const mvY = useMotionValue(y)
    const mvWidth = useMotionValue(width)
    const mvHeight = useMotionValue(height)

    const valuesRef = useRef([mvX, mvY, mvWidth, mvHeight] as const)

    return valuesRef.current
}

export function useMotionPair(x: number, y: number) {
    const mvX = useMotionValue(x)
    const mvY = useMotionValue(y)

    const valuesRef = useRef([mvX, mvY] as const)

    return valuesRef.current
}

export function useMousePosition(scope: RefObject<HTMLElement | null>) {
    const [x, y] = useMotionPair(0, 0)

    useEffect(() => {
        if (!scope.current) return
        const handler = (e: PointerEvent) => {
            const box = scope.current?.getBoundingClientRect()
            if (!box) return
            x.set(e.clientX - box.left)
            y.set(e.offsetY - box.top)
        }
        scope.current.addEventListener("pointermove", handler)
        return () => {
            scope.current?.removeEventListener("pointermove", handler)
        }
    }, [scope, x, y])

    return [x, y]
}

export function useSpringRect(
    x: number,
    y: number,
    width: number,
    height: number,
    options?: SpringOptions,
) {
    const mvX = useSpring(x, options)
    const mvY = useSpring(y, options)
    const mvWidth = useSpring(width, options)
    const mvHeight = useSpring(height, options)

    const valuesRef = useRef([mvX, mvY, mvWidth, mvHeight] as const)

    return valuesRef.current
}
