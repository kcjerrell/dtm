import { useProxyRef } from "@/hooks/valtioHooks"
import { Box, Button, type ButtonProps } from "@chakra-ui/react"
import {
    createContext,
    type PropsWithChildren,
    RefObject,
    useCallback,
    useContext,
    useRef,
    useState,
} from "react"

type CollapseState = "open" | "preclose" | "closing" | "closed" | "opening"

type CollapseContextType = {
    state: CollapseState
    height: number
    toggle: () => void
    contentRef: RefObject<HTMLDivElement | null>
    duration: number
}

const CollapseContext = createContext<CollapseContextType | undefined>(undefined)

interface CollapseRootProps extends ChakraProps {
    /** duration of the collapse transition in seconds */
    duration: number
}

export function CollapseRoot(props: PropsWithChildren<CollapseRootProps>) {
    const { children, duration, ...rest } = props

    const [state, setState] = useState<CollapseState>("closed")

    const height = useRef(0)
    const contentRef = useRef<HTMLDivElement>(null)
    const timeoutRef = useRef<NodeJS.Timeout | null>(null)

    const scheduleChange = useCallback(
        (state: CollapseState) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
            }
            timeoutRef.current = setTimeout(() => {
                setState(state)
                timeoutRef.current = null
            }, duration * 1000)
        },
        [duration],
    )

    const toggle = useCallback(() => {
        if (!contentRef.current) return
        height.current = contentRef.current.scrollHeight
        switch (state) {
            case "closed":
            case "closing":
                setState("opening")
                scheduleChange("open")
                break
            case "open":
                setState("preclose")
                setTimeout(() => setState("closing"), 0)
                scheduleChange("closed")
                break
            case "opening":
                setState("closing")
                scheduleChange("closed")
                break
        }
    }, [scheduleChange, state])

    const value = { state, height: height.current, toggle, contentRef, duration }

    return <CollapseContext.Provider value={value}>{children}</CollapseContext.Provider>
}

interface CollapseTriggerProps extends ButtonProps {
    openText?: string
    collapsedText?: string
}
export function CollapseTrigger(props: PropsWithChildren<CollapseTriggerProps>) {
    const { children, openText, collapsedText, ...rest } = props

    const cv = useContext(CollapseContext)
    if (!cv) throw new Error("Must use CollapseTrigger within a TriggerRoot")
    const { state, toggle } = cv

    const text = children ?? (isOpenState(state) ? openText : collapsedText)

    return (
        <Button {...rest} onClick={toggle}>
            {text}
        </Button>
    )
}

interface CollapseContentProps extends ChakraProps {}
export function CollapseContent(props: PropsWithChildren<CollapseContentProps>) {
    const { children, ...rest } = props

    const cv = useContext(CollapseContext)
    if (!cv) throw new Error("Must use CollapseTrigger within a TriggerRoot")
    const { state, height, contentRef, duration } = cv

    let maxHeight: string = "unset"
    if (state === "closed" || state === "closing") maxHeight = "0px"
    else if (state === "opening" || state === "preclose") maxHeight = `${height}px`

    return (
        <Box
            ref={contentRef}
            maxHeight={maxHeight}
            transition={`max-height ${duration}s, opacity ${duration / 2}s`}
            overflow={"hidden"}
            visibility={state === "closed" ? "hidden" : "visible"}
            {...rest}
        >
            {children}
        </Box>
    )
}

function isOpenState(state: CollapseState) {
    return state === "open" || state === "opening"
}
