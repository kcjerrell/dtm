import { type RefObject, useRef } from "react"

interface InitRefObject<T> extends RefObject<T> {
	set current(value: null)
	get current(): T
}

/** Returns a stable RefObject that initializes once. Use this for resources that need manual disposal or clearing. */
export function useInitRef<T>(init: () => T): InitRefObject<T> {
	const ref = useRef<T>(null)

	if (ref.current === null) {
		ref.current = init()
	}

	return ref as InitRefObject<T>
}

/** Returns a stable value that initializes once. */
export function useInit<T>(init: () => T): T {
	const ref = useRef<T>(null)

	if (ref.current === null) {
		ref.current = init()
	}

	return ref.current as T
}
