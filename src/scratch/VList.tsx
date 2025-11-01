import { Box, VStack } from "@chakra-ui/react"
import { proxy, useSnapshot } from "valtio"
import { CheckRoot } from "@/metadata/Containers"
import { Panel } from "@/components/common"
import VirtualizedList from "@/components/virtualizedList/VirtualizedList"

const store = proxy({
	someState: "Hello",
	items: Array.from({ length: 2000 }, () => randWord(10)),
})

function randWord(length: number) {
	return Array.from({ length }, () =>
		String.fromCharCode((Math.random() < 0.5 ? 65 : 97) + Math.floor(Math.random() * 26)),
	).join("")
}

function VList(props) {
	const snap = useSnapshot(store)

	return (
		<CheckRoot
			width={"full"}
			height={"full"}
			alignItems={"center"}
			justifyContent={"center"}
			padding={8}
		>
			<Panel width={"50%"} height={"100%"}>
				<VirtualizedList estimatedItemSize={'3rem'} items={snap.items} itemComponent={Item} />
			</Panel>
		</CheckRoot>
	)
}

function Item(props) {
	const {value, index, ...rest} = props
	return (
		<VStack bgColor={"bg.2/50"} margin={2} padding={2} {...rest}>
			<Box>{index} {value}</Box>
		</VStack>
	)
}
type F = typeof Item

export default VList
