import { Box, type BoxProps, chakra, Portal, type StackProps } from "@chakra-ui/react"
import { motion } from "motion/react"
import { type ComponentProps, type ReactNode, type RefObject, useEffect, useRef } from "react"
import { useRootElement } from "@/hooks/useRootElement"

const Panel = chakra(motion.div, {
    base: {
        padding: 1,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "flex-start",
        position: "absolute",
        overflow: "clip",
        fontSize: "sm",
        bgColor: "grayc.14",
        boxShadow: "pane1",
        borderRadius: "xl",
        gap: 0,
    },
})

export interface ContentPanelPopupProps extends StackProps {
    onClose: () => void
    children: ReactNode
    shadeElem?: RefObject<HTMLDivElement | null> | null
    shadeProps?: BoxProps
    panelProps?: ComponentProps<typeof Panel>
    outsideInteractionExclusions?: string[]
}

export const CLOSE_TRANSIENT_POPUPS_EVENT = "dtp:close-transient-popups"

export function ContentPanelPopup(props: ContentPanelPopupProps) {
    const {
        onClose,
        children,
        shadeElem,
        shadeProps,
        panelProps,
        outsideInteractionExclusions = [],
    } = props

    const panelRef = useRef<HTMLDivElement>(null)

    const root = useRootElement("view")

    useEffect(() => {
        if (!panelRef.current) return

        const isExcludedTarget = (target: EventTarget | null): boolean => {
            const elem = target instanceof Element ? target : null
            if (!elem) return false
            return outsideInteractionExclusions.some((selector) => elem.closest(selector) !== null)
        }

        const shouldClose = (target: EventTarget | null): boolean => {
            const elem = target instanceof Element ? target : null
            if (!elem) return false
            if (panelRef.current === elem || panelRef.current?.contains(elem)) return false
            if (elem.closest("[data-filter-popup]") !== null) return false
            if (isExcludedTarget(elem)) return false
            return true
        }

        const pointerHandler = (e: PointerEvent) => {
            if (!shouldClose(e.target)) return
            e.preventDefault()
            e.stopPropagation()
            onClose()
        }

        const keyHandler = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return
            e.preventDefault()
            e.stopPropagation()
            onClose()
        }

        const forceCloseHandler = () => {
            onClose()
        }

        window.addEventListener("pointerdown", pointerHandler, { capture: true })
        window.addEventListener("keydown", keyHandler, { capture: true })
        window.addEventListener(CLOSE_TRANSIENT_POPUPS_EVENT, forceCloseHandler)

        return () => {
            window.removeEventListener("pointerdown", pointerHandler, true)
            window.removeEventListener("keydown", keyHandler, true)
            window.removeEventListener(CLOSE_TRANSIENT_POPUPS_EVENT, forceCloseHandler)
        }
    }, [onClose, outsideInteractionExclusions])

    if (!root) return null

    return (
        <Portal container={{ current: shadeElem?.current || root }}>
            <Box
                position="absolute"
                zIndex={5}
                top={0}
                left={0}
                width={"100%"}
                height={"100%"}
                {...shadeProps}
                containerType={"size"}
            >
                <Panel
                    data-solid
                    ref={panelRef}
                    style={{
                        top: "12vh",
                        minWidth: "25rem",
                        maxWidth: "30rem",
                        width: "80%",
                        height: "76vh",
                    }}
                    pointerEvents={"auto"}
                    // onClick={(e) => e.stopPropagation()}
                    overflow="visible"
                    css={{
                        "@container (width < 29rem)": {
                            "&": {
                                left: "unset",
                                right: "2rem",
                            },
                        },
                        "@container (width > 25rem)": {
                            "&": {
                                left: "2rem",
                                // transform: "translateX(-50%)",
                                right: "unset",
                            },
                        },
                    }}
                    {...panelProps}
                >
                    {children}
                </Panel>
            </Box>
        </Portal>
    )
}
