import { useCallback, useMemo } from "react"
import { proxySet } from "valtio/utils"
import { useProxyRef } from "./valtioHooks"

export function useItemSelection<T>() {
    const { state, snap } = useProxyRef(() => proxySet<T>())

    const selectItem = useCallback(
        (item: T, selected = true) => {
            if (selected) state.add(item)
            else state.delete(item)
        },
        [state],
    )

    const toggleItem = useCallback(
        (item: T) => {
            selectItem(item, !state.has(item))
        },
        [selectItem, state],
    )

    const clear = useCallback(() => {
        state.clear()
    }, [state])

    const isSelected = useCallback(
        (item: T) => {
            if (state.size === 0) return undefined
            return state.has(item)
        },
        [state],
    )

    const ret = useMemo(
        () => ({
            selectItem,
            clear,
            isSelected,
            toggleItem,
            state,
            snap,
        }),
        [clear, isSelected, selectItem, snap, state, toggleItem],
    )
    return ret
}
