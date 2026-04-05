import {
    createContext,
    type RefObject,
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
} from "react"
import { proxy, useSnapshot } from "valtio"

type MeasureGroupContextType = {
    columns: number
    gap: number
    collapseHeight?: number
    sizerRef: RefObject<HTMLDivElement | null>
    maxItemLines: number
}

type CollapseState = "normal" | "collapsed" | "expanded"
type UseMeasureGridState = {
    span: number
    collapse: CollapseState
    maxHeight: string
    toggleCollapsed: () => void
}

export const MeasureGroupContext = createContext<MeasureGroupContextType | null>(null)

type UseMeasureGridOpts = {
    forceSpan?: boolean
    onCollapseChange?: (value: "collapsed" | "expanded") => void
    initialCollapse?: "collapsed" | "expanded"
    expanded?: boolean
}

export function useMeasureGrid(content?: string | null, opts: UseMeasureGridOpts = {}) {
    const { forceSpan = false, onCollapseChange, expanded, initialCollapse } = opts

    const cv = useContext(MeasureGroupContext)
    const stateRef = useRef<UseMeasureGridState>(null)
    if (!stateRef.current) {
        stateRef.current = proxy({
            span: 1,
            collapse: "normal" as CollapseState,
            maxHeight: "500px",
            toggleCollapsed: () => {
                if (!stateRef.current || stateRef.current.collapse === "normal") return

                if (expanded !== undefined && onCollapseChange) {
                    onCollapseChange(expanded ? "expanded" : "collapsed")
                    return
                }

                const newValue = stateRef.current.collapse === "expanded" ? "collapsed" : "expanded"
                stateRef.current.collapse = newValue
                if (onCollapseChange) onCollapseChange(newValue)
            },
        })
    }
    const state = stateRef.current
    const snap = useSnapshot(state)

    useLayoutEffect(() => {
        if (!cv || !cv.sizerRef.current || !cv.sizerRef.current.parentElement) return
        const sizer = cv.sizerRef.current
        const sizerParent = cv.sizerRef.current.parentElement
        if (cv.collapseHeight == null) {
            sizer.textContent = Array(cv.maxItemLines).fill("ABC").join("\n")
            cv.collapseHeight = sizer.clientHeight
        }

        const { columns, gap, collapseHeight } = cv

        sizer.textContent = content ?? ""

        const width = sizer.clientWidth
        const height = sizer.clientHeight
        const maxWidth = sizerParent.clientWidth

        state.span = width > maxWidth / columns - gap || forceSpan ? columns : 1
        if (height > collapseHeight && state.collapse === "normal") {
            state.collapse = initialCollapse ?? "collapsed"
            state.maxHeight = `${collapseHeight}px`
        }
    }, [content, cv, forceSpan, state, initialCollapse])

    useEffect(() => {
        if (
            expanded !== undefined &&
            onCollapseChange &&
            stateRef.current &&
            stateRef.current.collapse !== "normal"
        ) {
            stateRef.current.collapse = expanded ? "expanded" : "collapsed"
        }
    }, [expanded, onCollapseChange])

    return snap
}
