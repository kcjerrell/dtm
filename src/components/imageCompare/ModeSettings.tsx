import { Grid } from "@chakra-ui/react"
import { AnimatePresence, motion } from "motion/react"
import type { BoundMode } from "./Root"

interface ModeSettingsProps {
    activeMode: BoundMode
    modes: readonly BoundMode[]
}

export default function ModeSettings({ activeMode }: ModeSettingsProps) {
    return (
        <Grid
            clipPath={"rect(-4px 100% calc(100% + 8px) 0%)"}
            gridTemplateColumns={"1fr"}
            gridTemplateRows={"min-content"}
        >
            <AnimatePresence mode={"sync"}>
                <motion.div
                    key={activeMode.name}
                    style={{
                        gridColumn: "1",
                        gridRow: "1",
                        display: "flex",
                        flexDirection: "row",
                        gap: "round(0.75rem, 1px)",
                    }}
                    initial={{ y: "-100%" }}
                    animate={{ y: "0%" }}
                    exit={{ y: "100%" }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                    {activeMode.settings}
                </motion.div>
            </AnimatePresence>
        </Grid>
    )
}
