import { useMotionValue } from "motion/react"

export function useMotionRect(x: number, y: number, width: number, height: number) {
    const mvX = useMotionValue(x)
    const mvY = useMotionValue(y)
    const mvWidth = useMotionValue(width)
    const mvHeight = useMotionValue(height)

    return [mvX, mvY, mvWidth, mvHeight] as const
}
