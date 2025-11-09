import { Box, Button, HStack, VStack } from "@chakra-ui/react"
import { proxy, useSnapshot } from "valtio"
import { CheckRoot } from "@/components"
import { MotionBox, Panel } from "@/components/common"
import { motion } from "motion/react"

const store = proxy({
	someState: "Hello",
	items: [] as Example[],
	items2: Array(50),
})

store.items2[9] = "hello"

class PagedCollection {
	
}

function Empty(props) {
	const snap = useSnapshot(store)

	return (
		<CheckRoot width={"full"} height={"full"} zoom={1}>
			<HStack width={"full"} height={"full"} justifyContent={"center"} gap={20}>
				<Box
					position={"relative"}
					width={"400px"}
					height={"400px"}
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
					{snap.items.map((item, i) => (
						<Box
							key={i}
							bgColor={item.state.color}
							width={"3%"}
							height={"3%"}
							top={`${item.state.y}%`}
							left={`${item.x}%`}
							position={"absolute"}
						/>
					))}
				</Box>

				<VStack>
					<Box>{snap.items2.length} {store.items2.length}</Box>
					<Button
						onClick={() => {
							store.items.push(new Example())
						}}
					>
						Add
					</Button>
					{snap.items.map((item, i) => {
						return (
							<Button key={i} onClick={() => item.randomize()}>
								Random {i}
							</Button>
						)
					})}
				</VStack>
			</HStack>
		</CheckRoot>
	)
}

export default Empty

class Example {
	state = proxy({
		x: 0,
		y: 0,
		color: "#000000",
	})

	constructor() {
		this.s = () => this.state
	}

	get x() {
		return this.state.x
	}

	randomize() {
		this.s().x = Math.random() * 50 + 25
		this.s().y = Math.random() * 50 + 25
		this.s().color = `#${Math.floor(Math.random() * 16777215).toString(16)}`
	}
}

class SelectableCollection<T> extends Array<T> {

	
}
