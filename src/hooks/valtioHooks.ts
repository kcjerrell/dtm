import { useEffect, useEffectEvent, useRef } from 'react'
import { proxy, subscribe, useSnapshot } from 'valtio'
import { useInitRef } from './useInitRef'

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

export function useProxyRef<T extends object>(init: () => T, sync = false) {
  const state = useInitRef(() => proxy(init()))
  const snap = useSnapshot(state, { sync })
  return { state, snap }
}