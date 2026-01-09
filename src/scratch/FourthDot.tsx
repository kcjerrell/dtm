import { Box, Portal, VStack } from "@chakra-ui/react"
import { proxy, useSnapshot } from "valtio"
import { CheckRoot } from "@/components"
import { Panel } from "@/components/common"
import { useRootElement } from "@/hooks/useRootElement"
import { motion } from "motion/react"

const store = proxy({
    isOpen: false,
})

function FourthDot(props) {
    const snap = useSnapshot(store)

    const root = useRootElement("app")

    return (
        <CheckRoot width={"full"} height={"full"}>
            <Portal container={{ current: root }}>
                <motion.div
                    className={"group"}
                    variants={{
                        closed: {
                            borderRadius: "50%",
                            width: "12px",
                            height: "12px",
                        },
                        open: {
                            width: "80px",
                            height: "80px",
                            borderRadius: "20%",
                        },
                    }}
                    animate={snap.isOpen ? "open" : "closed"}
                    style={{
                        left: "68px",
                        top: "8px",
                        position: "absolute",
                        zIndex: 2,
                        backgroundColor: "rgba(111, 150, 242, 1)",
                    }}
                    onClick={() => {
                        store.isOpen = !store.isOpen
                    }}
                >
                    <Box
                        position={"relative"}
                        width={"full"}
                        height={"full"}
                        _hover={{ opacity: 1 }}
                        opacity={0}
                    >
                        <motion.div
                            style={{
                                position: "absolute",
                                width: 6,
                                height: 1.5,
                                backgroundColor: "black",
                                top: 4,
                                left: 3,
                            }}
                        />
                        <motion.div
                            style={{
                                position: "absolute",
                                width: 6,
                                height: 1.5,
                                backgroundColor: "black",
                                top: 7,
                                left: 3,
                            }}
                        />
                    </Box>
                </motion.div>
            </Portal>

            <VStack width={"full"} height={"full"} justifyContent={"center"}>
                <Panel>{snap.someState}</Panel>
            </VStack>
        </CheckRoot>
    )
}

export default FourthDot
