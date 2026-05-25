import { getCurrentWindow } from "@tauri-apps/api/window"
import { useMemo } from "react"
import { useProxyRef } from "./valtioHooks"

export function useMetadataDrop() {
    const { state, snap } = useProxyRef(() => ({ isDragging: true, dragCounter: 0 }))

    const handlers = useMemo(
        () => ({
            onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
                e.preventDefault()
            },
            onDrop: async (e: React.DragEvent<HTMLDivElement>) => {
                e.preventDefault()
                state.isDragging = false
                state.dragCounter = 0
                getCurrentWindow().setFocus()
                const { handleDrop } = await import("@/metadata/state/interop")
                handleDrop("drag")
            },
            onDragEnter: (e: React.DragEvent<HTMLDivElement>) => {
                e.preventDefault()
                state.dragCounter++
                if (state.dragCounter >= 1) state.isDragging = true
                // console.log("drag enter", e.currentTarget)
            },
            onDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
                e.preventDefault()
                state.dragCounter--
                if (state.dragCounter === 0) state.isDragging = false
                // console.log("drag leave", e.currentTarget)
            },
        }),
        [state],
    )

    return {
        isDragging: snap.isDragging,
        handlers,
    }
}
