import { Box, type BoxProps, chakra, Portal, type StackProps } from "@chakra-ui/react"
import { motion } from "motion/react"
import { type ComponentProps, type ReactNode, type RefObject, useEffect, useRef } from "react"
import { useMotionRect } from "@/hooks/motion"
import { useRootElement } from "@/hooks/useRootElement"

const Container = chakra("div", {
    base: {
        position: "absolute",
        inset: "10%",
        overflow: "visible",
        containerType: "inline-size",
        containerName: "content-popop-container",
        zIndex: 2,
    },
})

const Positioner = chakra("div", {
    base: {
        // padding: 1,
        // display: "flex",
        // alignItems: "stretch",
        // justifyContent: "flex-start",
        position: "absolute",
        height: "100%",
        maxWidth: "30rem",
        minWidth: "25rem",
        width: "100%",
        // overflow: "clip",
        // fontSize: "sm",
        // bgColor: "bg.2",
        // boxShadow: "pane1",
        // borderRadius: "xl",
        // gap: 0,
        // zIndex: 2,
    },
})

const Panel = chakra(motion.div, {
    base: {
        padding: 1,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "flex-start",
        position: "absolute",
        // height: "100%",
        // maxWidth: "30rem",
        // minWidth: "25rem",
        // width: "100%",
        overflow: "clip",
        fontSize: "sm",
        bgColor: "grayc.14",
        boxShadow: "pane1",
        borderRadius: "xl",
        gap: 0,
        // zIndex: 2,
    },
})

export interface ContentPanelPopupProps extends StackProps {
    onClose: () => void
    children: ReactNode
    shadeColor?: string
    shadeTransition?: number
    allowPointerEvents?: boolean
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
        shadeColor,
        shadeTransition = 0,
        allowPointerEvents = true,
        shadeElem,
        shadeProps,
        panelProps,
        outsideInteractionExclusions = [],
        ...restProps
    } = props
    const [mvX, mvY, mvWidth, mvHeight] = useMotionRect(0, 0, 0, 0)

    const panelRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const positionerRef = useRef<HTMLDivElement>(null)

    const root = useRootElement("view")

    useEffect(() => {
        if (!panelRef.current || !containerRef.current || !positionerRef.current) return

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

        const ro = new ResizeObserver(() => {
            if (!panelRef.current || !containerRef.current || !positionerRef.current || !root)
                return

            const { x, y, width, height } = positionerRef.current.getBoundingClientRect()
            const { x: rootX, y: rootY } = root.getBoundingClientRect()
            mvX.set(x - rootX)
            mvY.set(y - rootY)
            mvWidth.set(width)
            mvHeight.set(height)
            // }
        })
        ro.observe(positionerRef.current)
        ro.observe(containerRef.current)
        return () => {
            window.removeEventListener("pointerdown", pointerHandler, true)
            window.removeEventListener("keydown", keyHandler, true)
            window.removeEventListener(CLOSE_TRANSIENT_POPUPS_EVENT, forceCloseHandler)
            ro.disconnect()
        }
    }, [mvHeight, mvWidth, mvX, mvY, onClose, outsideInteractionExclusions, root])

    if (!root) return null

    return (
        <Container
            ref={containerRef}
            css={
                {
                    // "@container (width < 25rem)": {
                    //     "& div": {
                    //         left: "unset",
                    //         right: "0",
                    //     },
                    // },
                    // "@container (width > 25rem)": {
                    //     "& div": {
                    //         left: "0",
                    //         right: "unset",
                    //     },
                    // },
                }
            }
            {...restProps}
        >
            <Positioner data-filter-popup {...props} ref={positionerRef}>
                <Portal container={{ current: shadeElem?.current || root }}>
                    <Box
                        position="absolute"
                        zIndex={2}
                        top={0}
                        left={0}
                        width={"100%"}
                        height={"100%"}
                        // bgColor={shadeColor}
                        // onClick={onClose}
                        // pointerEvents={allowPointerEvents ? "none" : "auto"}
                        transition={`background-color ${shadeTransition}ms ease`}
                        {...shadeProps}
                    >
                        <Panel
                            data-solid
                            ref={panelRef}
                            style={{
                                left: mvX,
                                top: mvY,
                                width: mvWidth,
                                height: panelProps?.height ? undefined : mvHeight,
                            }}
                            pointerEvents={"auto"}
                            // onClick={(e) => e.stopPropagation()}
                            overflow="visible"
                            {...panelProps}
                        >
                            {children}
                        </Panel>
                    </Box>
                </Portal>
            </Positioner>
        </Container>
    )
}
