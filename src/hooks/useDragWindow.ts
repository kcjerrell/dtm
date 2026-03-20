import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect } from "react"

const LEFT = 65
const RIGHT = 12
const BOTTOM = 24

export function useDragWindow() {
    useEffect(() => {
        const handlePointerDown = async (e: PointerEvent) => {
            const xMax = window.innerWidth - RIGHT
            const xMin = LEFT
            const yMax = BOTTOM

            if (e.clientX > xMin && e.clientX < xMax && e.clientY < yMax) {
                e.stopPropagation()
                e.preventDefault()
                let hasMoved = false
                const win = await getCurrentWindow()
                const unlisten = await win.onMoved(() => {
                    hasMoved = true
                })
                addEventListener(
                    "pointerup",
                    async () => {
                        unlisten()
                    },
                    {
                        capture: true,
                        once: true,
                    },
                )
                addEventListener(
                    "click",
                    (clickEvent) => {
                        if (hasMoved) {
                            clickEvent.preventDefault()
                            clickEvent.stopImmediatePropagation()
                        }
                    },
                    {
                        capture: true,
                        once: true,
                    },
                )
                await win.startDragging()
            }
        }

        addEventListener("pointerdown", handlePointerDown, { capture: true })

        return () => {
            removeEventListener("pointerdown", handlePointerDown, { capture: true })
        }
    }, [])
}
