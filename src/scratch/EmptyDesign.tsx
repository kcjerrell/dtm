import { motion } from "motion/react"
import { CheckRoot, Panel } from "@/components"

function Empty() {
    return (
        <CheckRoot width={"full"} height={"full"} padding={8}>
            <Panel width={"full"} height={"full"} justifyContent={"center"} alignItems={"center"}>
                <motion.div />
            </Panel>
        </CheckRoot>
    )
}

export default Empty
