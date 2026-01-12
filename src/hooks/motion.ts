import { type SpringOptions, useMotionValue, useSpring } from "motion/react"
import { useRef } from "react"

export function useMotionRect(x: number, y: number, width: number, height: number) {
    const mvX = useMotionValue(x)
    const mvY = useMotionValue(y)
    const mvWidth = useMotionValue(width)
    const mvHeight = useMotionValue(height)

    const valuesRef = useRef([mvX, mvY, mvWidth, mvHeight] as const)

    return valuesRef.current
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
