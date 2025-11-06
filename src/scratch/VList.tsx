import { Box, VStack } from "@chakra-ui/react"
import { proxy, useSnapshot } from "valtio"
import { CheckRoot } from "@/components"
import { Panel } from "@/components/common"
import VirtualizedList from "@/components/virtualizedList/VirtualizedList"
import { useEffect, useState } from "react"
import { DotSpinner } from "@/components/preview"

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
				<DotSpinner position={"absolute"} width={"30%"} height={"30%"} top={"35%"} left={"35%"} />

				{/* <VirtualizedList
					estimatedItemSize={35}
					items={snap.items}
					itemComponent={Item}
					keyFn={(item, index) => item}
				/> */}
			</Panel>
		</CheckRoot>
	)
}

function Item(props) {
	const { value, index, onSizeChanged, ...rest } = props
	const [expanded, setExpanded] = useState(false)

	useEffect(() => {
		if (expanded) onSizeChanged(index, false)
	}, [expanded, index, onSizeChanged])

	return (
		<VStack
			bgColor={index % 10 === 0 ? "blue" : "bg.2"}
			margin={2}
			padding={2}
			onClick={() =>
				setExpanded((v) => {
					if (v) onSizeChanged(index, true)
					return !v
				})
			}
			{...rest}
		>
			<Box>
				{index} {value} {String(expanded)}
			</Box>
			{expanded && <Box>Expanded</Box>}
		</VStack>
	)
}
type F = typeof Item

export default VList
