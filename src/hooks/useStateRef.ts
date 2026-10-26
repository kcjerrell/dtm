import { useCallback, useRef, useState } from "react"

export function useStateRef<T>(initialValue: T | (() => T), setter?: (v: T) => T) {
    const stateRef = useRef<T | undefined>(undefined)
    const setterRef = useRef(setter)

    const [value, setValueState] = useState<T>(() => {
        const v = typeof initialValue === "function" ? (initialValue as () => T)() : initialValue
        stateRef.current = v
        return v
    })

    const setValue = useCallback((value: T | ((v: T) => T)) => {
        const newValue =
            typeof value === "function" ? (value as (v: T) => T)(stateRef.current as T) : value
        const coercedValue = setterRef.current ? setterRef.current(newValue) : newValue
        stateRef.current = coercedValue
        setValueState(coercedValue)
    }, [])

    return [value, setValue, stateRef] as const
}
