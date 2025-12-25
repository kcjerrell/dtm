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

export function useProxyRef<T extends object>(init: () => T, sync = false) {
	const state = useInit(() => proxy(init()))
	const snap = useSnapshot(state, { sync })
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
