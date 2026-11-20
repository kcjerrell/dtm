import { Box } from "@chakra-ui/react"
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react"
import { useLayoutEffect, useRef, useState } from "react"
import type { BoundMode } from "./Root"

interface ModeSettingsProps {
    activeMode: BoundMode
    modes: readonly BoundMode[]
}

export default function ModeSettings({ activeMode, modes }: ModeSettingsProps) {
    const reduceMotion = useReducedMotion()
    const rotation = useMotionValue(0)
    const prismRef = useRef<HTMLDivElement>(null)
    const [faces, setFaces] = useState<{
        activeName: string
        outgoingName: string | null
    }>({ activeName: activeMode.name, outgoingName: null })

    if (faces.activeName !== activeMode.name) {
        setFaces({
            activeName: activeMode.name,
            outgoingName: reduceMotion ? null : faces.activeName,
        })
    }

    const outgoingMode = reduceMotion
        ? undefined
        : modes.find(({ name }) => name === faces.outgoingName)
    const rotating = outgoingMode !== undefined

    useLayoutEffect(() => {
        // Start each turn with the previously selected settings facing front.
        rotation.jump(0)
        const prism = prismRef.current
        if (!rotating || !prism) return

        // The front and top faces meet when their common pivot is half a face behind the front.
        prism.style.setProperty("--settings-pivot-z", `${-prism.offsetHeight / 2}px`)
        const animation = animate(rotation, -90, {
            duration: 0.28,
            ease: "easeInOut",
            onComplete: () => {
                setFaces((current) =>
                    current === faces ? { ...faces, outgoingName: null } : current,
                )
            },
        })
        return () => animation.stop()
    }, [faces, rotating, rotation])

    const pivot = rotating ? "center center var(--settings-pivot-z, 0px)" : undefined

    return (
        <Box style={{ perspective: rotating ? "600px" : undefined }}>
            <motion.div
                ref={prismRef}
                style={{
                    display: "grid",
                    rotateX: rotating ? rotation : 0,
                    transformOrigin: pivot,
                    transformStyle: rotating ? "preserve-3d" : undefined,
                }}
            >
                {(outgoingMode ? [outgoingMode, activeMode] : [activeMode]).map((mode) => {
                    const outgoing = mode.name !== activeMode.name
                    return (
                        <Box
                            key={mode.name}
                            display="flex"
                            gridArea="1 / 1"
                            bgColor={rotating ? "grayc.14" : undefined}
                            _dark={rotating ? { bgColor: "grayc.16" } : undefined}
                            inert={outgoing}
                            aria-hidden={outgoing || undefined}
                            style={{
                                backfaceVisibility: rotating ? "hidden" : undefined,
                                transform: rotating && !outgoing ? "rotateX(90deg)" : undefined,
                                transformOrigin: pivot,
                            }}
                        >
                            {mode.settings}
                        </Box>
                    )
                })}
            </motion.div>
        </Box>
    )
}
