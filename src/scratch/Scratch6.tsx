import { Box, Button, VStack } from "@chakra-ui/react"
import { proxy, snapshot, subscribe, useSnapshot } from "valtio"
import { CheckRoot } from "@/components"
import { Panel } from "@/components/common"
import { useInitRef } from "@/hooks/useInitRef"
import { useEffect, useEffectEvent, useRef } from "react"

const store = proxy({
	someState: "Hello",
	items: [] as unknown[],
	value: 0,
})

function useSubscribeValue<T extends Record<string, unknown>, K extends keyof T>(
	proxy: T,
	key: K,
	callback: (value: T[K]) => void,
) {
	const prevValue = useRef(proxy[key])
	const effectEvent = useEffectEvent(callback)

	// biome-ignore lint/correctness/useExhaustiveDependencies: effect event
	useEffect(() => {
		const unsubscribe = subscribe(proxy, () => {
			if (proxy[key] === prevValue.current) return
			prevValue.current = proxy[key]
			effectEvent(proxy[key])
		})
		return () => unsubscribe()
	}, [proxy, key])
}

function Empty(props) {
	useSubscribeValue(store, "someState", (value) => {
		console.log(value)
	})

	const snap = useSnapshot(store)

	return (
		<CheckRoot width={"full"} height={"full"}>
			<VStack width={"full"} height={"full"} justifyContent={"center"}>
				<Panel>
					{snap.value}
					{snap.items.toString()}
					{/* {snap2.value} */}
				</Panel>
				<Button
					onClick={() => {
						store.items.push(new Date().toDateString())
						store.someState = "Hello2"
					}}
				>
					Change
				</Button>
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
