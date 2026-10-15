import { useCallback, useEffect, useEffectEvent, useRef } from "react"

type UseTimeoutOptions<T = undefined> = {
    fn: (arg?: T) => void | Promise<void>
    arg?: T
    delay?: number
    /**
     * Sets what should happen when calling start while the timout is already active.
     * `reset` will cancel the currently active timeout, `ignore` will ignore the second call.
     * The default is `reset`
     */
    behavior?: "reset" | "ignore"
}
export function useTimeout<T = unknown>(opts: UseTimeoutOptions<T>) {
    const { fn, delay = 100, behavior = "reset", arg } = opts

    const ref = useRef<ReturnType<typeof setTimeout> | null>(null)

    const start = useCallback(() => {
        if (ref.current && behavior === "ignore") return
        if (ref.current) {
            clearTimeout(ref.current)
        }
        ref.current = setTimeout(async () => {
            ref.current = null
            await fn(arg)
        }, delay)
    }, [behavior, delay, fn, arg])

    const cancel = useCallback(() => {
        if (ref.current) {
            clearTimeout(ref.current)
            ref.current = null
        }
    }, [])

    useEffect(() => {
        return () => cancel()
    }, [cancel])

    return [start, cancel]
}
