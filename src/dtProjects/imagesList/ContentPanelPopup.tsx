import { Box, type BoxProps, chakra, Portal, type StackProps } from "@chakra-ui/react"
import { motion } from "motion/react"
import { type ReactNode, type RefObject, useEffect, useRef } from "react"
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
        bgColor: "bg.1",
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
    shadeElem?: RefObject<HTMLDivElement>
    shadeProps?: BoxProps
}

export function ContentPanelPopup(props: ContentPanelPopupProps) {
    const {
        onClose,
        children,
        shadeColor,
        shadeTransition = 0,
        allowPointerEvents = true,
        shadeElem,
        shadeProps,
        ...restProps
    } = props
    const [mvX, mvY, mvWidth, mvHeight] = useMotionRect(0, 0, 0, 0)

    const panelRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const positionerRef = useRef<HTMLDivElement>(null)

    const root = useRootElement("view")

    useEffect(() => {
        if (!panelRef.current || !containerRef.current || !positionerRef.current) return
        const handler = (e: MouseEvent) => {
            if (panelRef.current === e.target || panelRef.current?.contains(e.target as Node)) return
            const insidePopup = (e.target as HTMLElement).closest("[data-filter-popup]") !== null
            if (insidePopup) return
            onClose()
        }
        window.addEventListener("click", handler, { capture: true })
        
        const ro = new ResizeObserver((entries) => {
            // for (const entry of entries) {
            // if (entry.target !== elem) continue
            if (!panelRef.current || !containerRef.current || !positionerRef.current) return

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
            window.removeEventListener("click", handler, { capture: true })
            ro.disconnect()
        }
    }, [mvHeight, mvWidth, mvX, mvY, onClose, root])

    return (
        <Container
            ref={containerRef}
            css={{
                "@container (width < 25rem)": {
                    "& div": {
                        left: "unset",
                        right: "0",
                    },
                },
                "@container (width > 25rem)": {
                    "& div": {
                        left: "0",
                        right: "unset",
                    },
                },
            }}
            {...restProps}
        >
            <Positioner data-filter-popup {...props} ref={positionerRef}>
                <Portal container={{ current: shadeElem?.current || root }}>
                    <Box
                        position="absolute"
                        width={"100%"}
                        height={"100%"}
                        // bgColor={shadeColor}
                        // onClick={onClose}
                        // pointerEvents={allowPointerEvents ? "none" : "auto"}
                        transition={`background-color ${shadeTransition}ms ease`}
                        {...shadeProps}
                    >
                        <Panel
                            ref={panelRef}
                            style={{
                                left: mvX,
                                top: mvY,
                                width: mvWidth,
                                height: mvHeight,
                            }}
                            pointerEvents={"auto"}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {children}
                        </Panel>
                    </Box>
                </Portal>
            </Positioner>
        </Container>
    )
}
