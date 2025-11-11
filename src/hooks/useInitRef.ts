import { useRef } from 'react'

export function useInitRef<T>(init: () => T) {
  const ref = useRef<T>(null)

  if (ref.current === null) {
    ref.current = init()
  }

  return ref.current as T
}