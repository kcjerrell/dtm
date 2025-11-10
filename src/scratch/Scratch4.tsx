import { Box, Button, HStack, VStack } from "@chakra-ui/react"
import { proxy, useSnapshot } from "valtio"
import { CheckRoot } from "@/components"
import { MotionBox, Panel } from "@/components/common"
import { motion } from "motion/react"
import PVList from "@/components/virtualizedList/PVLIst"

const store = proxy({
	someState: "Hello",
	items: [] as Example[],
	items2: Array(50),
})

store.items2[9] = "hello"

class PagedCollection {}

function Empty(props) {
	const snap = useSnapshot(store)

	return (
		<CheckRoot width={"full"} height={"full"} zoom={1}>
			<Panel>
				<PVList
					itemComponent={Item}
					totalCount={4000}
					pageSize={100}
					getItems={(skip, take) => getItems(skip, take)}
				/>
			</Panel>
		</CheckRoot>
	)
}

export default Empty

function Item(props) {
	if (props.value === null) return <Box>Loading...</Box>
	return (
		<Box>
			{props.index} {props.value}
		</Box>
	)
}

async function getItems(skip: number, take: number) {
	console.log("loading page", skip, take)
	await new Promise((r) => setTimeout(r, 500))

	return Array(take)
		.fill(null)
		.map((_, i) => i + skip)
}
