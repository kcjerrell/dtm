import { Box, HStack, VStack } from "@chakra-ui/react"
import { proxy, useSnapshot } from "valtio"
import { CheckRoot } from "@/components"
import { MotionBox, Panel } from "@/components/common"
import { motion } from 'motion/react'

const store = proxy({
	someState: "Hello",
})

function Empty(props) {
	const snap = useSnapshot(store)

	return (
		<CheckRoot width={"full"} height={"full"} zoom={1}>
			<HStack width={"full"} height={"full"} justifyContent={"center"} gap={20}>
				<Box
					width={"120px"}
					height={"120px"}
					padding={2}
					borderRadius={"md"}
					bgColor={"bg.1"}
					display={"flex"}
					justifyContent={"center"}
					alignItems={"center"}
					boxShadow={
						"0px 1px 4px -2px #00000033, 2px 4px 6px -2px #00000022, -1px 4px 6px -2px #00000022,  0px 3px 12px -3px #00000033"
					}
				>
					Hello
				</Box>
				<Box
					width={"120px"}
					height={"120px"}
					padding={2}
					borderRadius={"md"}
					bgColor={"bg.1"}
					display={"flex"}
					justifyContent={"center"}
					alignItems={"center"}
					boxShadow={"pane1"}
					asChild
				>
					<motion.div
						initial={{
							border: "1px solid #77777722",
						}}
						// animate={{
						// 	border: [
						// 		"1px solid #77777777",
						// 		"1px solid #00000077",
						// 		"1px solid #ffffff77",
						// 		"1px solid #77777777",
						// 	],
						// }}
						transition={{
							duration: 2,
							repeat: Infinity,
							repeatType: "loop",
							ease: "anticipate",
							times: [0, 0.33, 0.66, 1],
						}}
					>
						Hello
					</motion.div>
				</Box>
			</HStack>
		</CheckRoot>
	)
}

export default Empty
