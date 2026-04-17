import { useCallback, useRef } from "react"

type UseThresholdDelayOpts = {
    time?: number
    threshold?: number
    callback?: () => void | Promise<void>
}

export function useThresholdDelay(opts: UseThresholdDelayOpts) {
    const { time = 200, threshold = 50, callback = () => {} } = opts

    const level = useRef(0)
    const lastInc = useRef(0)

    const inc = useCallback(
        (amount: number) => {
            const now = performance.now()
            const elapsed = now - lastInc.current
            lastInc.current = now

            if (elapsed > time) level.current = 0

            level.current += amount

            if (level.current >= threshold) {
                callback()
            }
        },
        [callback, threshold, time],
    )

    return inc
}

export function useElapsed<T extends boolean>(
    startNow: T,
): T extends true ? () => number : () => number | null
export function useElapsed<T extends number>(initialValue: T): () => number
export function useElapsed(): () => number | null
export function useElapsed(arg0?: number | boolean) {
    const last = useRef<number | null>(
        arg0 === true ? performance.now() : typeof arg0 === "number" ? arg0 : null,
    )

    const update = useCallback(() => {
        const lastLast = last.current
        last.current = performance.now()

        if (lastLast === null) return null
        return last.current - lastLast
    }, [])

    return update
}
