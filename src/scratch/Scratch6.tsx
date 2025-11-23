import { Box, VStack } from "@chakra-ui/react"
import { proxy, snapshot, useSnapshot } from "valtio"
import { CheckRoot } from "@/components"
import { Panel } from "@/components/common"
import { useInitRef } from "@/hooks/useInitRef"

const store = proxy({
	someState: "Hello",
	items: [] as unknown[],
	value: 0,
})

class Test {
	state = proxy({
		value: 0,
	})

	constructor() {
		setInterval(() => {
			this.state.value++
		}, 500)
	}

	use = () => {
		return useSnapshot(this.state)
	}
}

function Empty(props) {
	const state = useInitRef(() => new Test())
	const snap = state.use()
	// const snap2 = useSnapshot(state.state)

	return (
		<CheckRoot width={"full"} height={"full"}>
			<VStack width={"full"} height={"full"} justifyContent={"center"}>
				<Panel>
					{snap.value}
					{/* {snap2.value} */}
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
