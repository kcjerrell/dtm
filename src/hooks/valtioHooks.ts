import { useEffect, useEffectEvent, useRef } from "react"
import { proxy, subscribe, useSnapshot } from "valtio"
import { useInit } from "./useInitRef"
import { watch } from "valtio/utils"

export function useSubscribeValue<T extends Record<string, unknown>, K extends keyof T>(
    proxy: T,
    key: K,
    callback: (value: T[K]) => void,
) {
    const prevValue = useRef(proxy[key])
    const effectEvent = useEffectEvent(callback)

    // biome-ignore lint/correctness/useExhaustiveDependencies: effect event
    useEffect(() => {
        const unsubscribe = subscribe(proxy, () => {
            if (proxy[key] === prevValue.current) return
            prevValue.current = proxy[key]
            effectEvent(proxy[key])
        })
        return () => unsubscribe()
    }, [proxy, key])
}

type UseProxyRefOpts<T> = {
    sync?: boolean
    load?: (state: T) => Promise<void>
}
/**
 * Initialize a valtio proxy state and store it in a ref. Returns both the state proxy and the snapshot.
 * If the calling component does not read from the snapshot, this may cause extra renders on every property
 * change
 * @param init initialization function for the state. This will be wrapped in proxy by the hook
 * @param opts.sync if snapshot should be synced - use this if controlled inputs are losing cursor position
 * @param opts.load optional async function that will be called exactly once after the first render
 * @returns
 */
export function useProxyRef<T extends object>(init: () => T, opts?: UseProxyRefOpts<T>) {
    const state = useInit(() => proxy(init()))
    const snap = useSnapshot(state, { sync: opts?.sync ?? false })

    const ranLoad = useRef(false)

    const runLoad = useEffectEvent(() => {
        if (!ranLoad.current && opts?.load) {
            ranLoad.current = true
            opts.load(state).catch((e) => console.error(e))
        }
    })

    useEffect(() => {
        runLoad()
    }, [])

    return { state, snap }
}

export function debounceWatch<T extends object>(
    proxy: T,
    callback: () => void | Promise<void>,
    delay: number,
) {
    let waiting = 0

    const unsubscribe = subscribe<T>(
        proxy,
        async () => {
            waiting++
            await new Promise((resolve) => setTimeout(resolve, delay))
            waiting--
            console.log("debounceSubscribe", waiting)
            if (waiting === 0) callback()
        },
        true,
    )

    return () => unsubscribe()
}
