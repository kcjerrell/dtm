import { Box, VStack } from "@chakra-ui/react"
import { proxy, useSnapshot } from "valtio"
import { CheckRoot } from "@/components"
import { Panel } from "@/components/common"

const store = proxy({
	someState: "Hello",
	items: [] as unknown[],
})

const items = Array.from({ length: 10 }, (_, i) => ({ id: i, name: `Item ${i}` }))
const selectables = items.map((item) => makeSelectable(item))
store.items = selectables

function Empty(props) {
	const snap = useSnapshot(store)
	const itemsnap = useSnapshot(proxy(store.items))
	return (
		<CheckRoot width={"full"} height={"full"}>
			<VStack width={"full"} height={"full"} justifyContent={"center"}>
				<Panel>
					{snap.items.map((item) => (
						<Box
							key={item.id}
							onClick={() => item.setSelected(!item.selected)}
							bgColor={item.selected ? "blue/50" : "bg.2"}
						>
							{item.name}
						</Box>
					))}
				</Panel>
			</VStack>
		</CheckRoot>
	)
}

export default Empty

type Selectable<T> = T & {
	selected: boolean
	setSelected: (value: boolean) => void
	toggleSelected: () => void
}
function makeSelectable<T extends object>(item: T, initialValue = false): Selectable<T> {
	const p = proxy({
		...item,
		selected: initialValue,
		setSelected(value: boolean) {
			p.selected = value
		},
		toggleSelected() {
			p.selected = !p.selected
		},
	})

	return p
}
