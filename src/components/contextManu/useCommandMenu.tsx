import type { Point } from "motion"
import { useCallback, useRef, useState } from "react"
import type { Snapshot } from "valtio"
import type { ICommandItem } from "@/types"
import CommandMenu from "./CommandMenu"

export function useCommandMenu<T, C = undefined>(
    commands: ICommandItem<T, C>[],
    selected: readonly Snapshot<T>[],
    context?: C,
) {
    const anchorRef = useRef<HTMLElement>(null)
    const [open, setOpen] = useState(false)
    const [offset, setOffset] = useState<Point>()

    const Menu = () => (
        <CommandMenu
            offset={offset}
            open={open}
            setOpen={setOpen}
            anchorRef={anchorRef}
            commands={commands}
            selected={selected}
            context={context}
        />
    )

    const onContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        const target = e.currentTarget as HTMLElement
        const rect = target.getBoundingClientRect()
        setOffset({ x: e.clientX - rect.x, y: e.clientY - rect.y })
        anchorRef.current = e.target as HTMLElement
        setOpen(true)
    }, [])

    return { Menu, onContextMenu }
}
