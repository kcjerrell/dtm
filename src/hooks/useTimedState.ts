import { useCallback, useState } from "react"

export function useTimedState<T>(
    defaultValue: T,
    defaultTimeout: number,
): [T, (value: T, timeout?: number) => void] {
    const [value, setValueState] = useState(defaultValue)

    const setValue = useCallback(
        (newValue: T, timeout?: number) => {
            if (newValue !== defaultValue) {
                setValueState(newValue)
                setTimeout(() => {
                    setValueState(defaultValue)
                }, timeout || defaultTimeout)
            }
        },
        [defaultValue, defaultTimeout],
    )

    return [value, setValue]
}
