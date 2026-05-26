import { Box, Button, type ButtonProps } from "@chakra-ui/react"
import {
    createContext,
    type PropsWithChildren,
    useCallback,
    useContext,
    useRef,
    useState,
} from "react"

const CollapseContext = createContext({
    isOpen: false,
    isCollapsing: false,
    toggle: () => {},
    contentRef: { current: null as HTMLDivElement | null },
    height: 0,
    duration: 0.2,
})

interface CollapseRootProps extends ChakraProps {
    /** duration of the collapse transition in seconds */
    duration: number
}

export function CollapseRoot(props: PropsWithChildren<CollapseRootProps>) {
    const { children, duration, ...rest } = props

    const [isOpen, setIsOpen] = useState(false)
    const [isCollapsing, setIsCollapsing] = useState(false)
    const [height, setHeight] = useState(0)

    const contentRef = useRef<HTMLDivElement>(null)

    const toggle = useCallback(() => {
        if (!contentRef.current) return
        setHeight(contentRef.current.scrollHeight)
        if (isOpen) {
            setIsCollapsing(true)
            setTimeout(() => setIsOpen(false), 0)
            setTimeout(() => setIsCollapsing(false), duration * 1000)
        } else {
            setIsOpen(true)
            setIsCollapsing(true)
            setTimeout(() => setIsCollapsing(false), duration * 1000)
        }
    }, [isOpen, duration])

    const value = { isOpen, isCollapsing, toggle, contentRef, height, duration }

    return <CollapseContext.Provider value={value}>{children}</CollapseContext.Provider>
}

interface CollapseTriggerProps extends ButtonProps {
    openText?: string
    collapsedText?: string
}
export function CollapseTrigger(props: PropsWithChildren<CollapseTriggerProps>) {
    const { children, openText, collapsedText, ...rest } = props

    const { isOpen, isCollapsing, toggle } = useContext(CollapseContext)

    const text = children ?? (isOpen ? openText : collapsedText)

    return (
        <Button {...rest} onClick={toggle}>
            {text}
        </Button>
    )
}

interface CollapseContentProps extends ChakraProps {}
export function CollapseContent(props: PropsWithChildren<CollapseContentProps>) {
    const { children, ...rest } = props

    const { isOpen, isCollapsing, contentRef, height, duration } = useContext(CollapseContext)

    let maxHeight: string = "unset"
    if (isCollapsing) maxHeight = isOpen ? `${height}px` : "0px"
    else maxHeight = isOpen ? "unset" : "0px"

    return (
        <Box
            ref={contentRef}
            maxHeight={maxHeight}
            transition={`max-height ${duration}s, opacity ${duration / 2}s`}
            overflow={"hidden"}
            opacity={isOpen ? 1 : 0}
            {...rest}
        >
            {children}
        </Box>
    )
}
