import { useCallback, useEffect, useEffectEvent, useRef } from "react"

type UseTimeoutOptions = {
    fn: () => void | Promise<void>
    delay?: number
    /**
     * Sets what should happen when calling start while the timout is already active.
     * `reset` will cancel the currently active timeout, `ignore` will ignore the second call.
     * The default is `reset`
     */
    behavior?: "reset" | "ignore"
}
export function useTimeout(opts: UseTimeoutOptions) {
    const { fn, delay = 100, behavior = "reset" } = opts

    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const fnRef = useRef<() => Promise<void> | void>(fn)

    const start = useCallback(() => {
        if (timeoutRef.current && behavior === "ignore") return
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = setTimeout(async () => {
            timeoutRef.current = null
            await fnRef.current()
        }, delay)
    }, [behavior, delay])

    const cancel = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }
    }, [])

    useEffect(() => {
        fnRef.current = fn
    }, [fn])

    useEffect(() => {
        return () => cancel()
    }, [cancel])

    return [start, cancel] as const
}
