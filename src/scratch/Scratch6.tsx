import { Box, Button, ButtonProps, HStack, VStack } from "@chakra-ui/react"
import { proxy, ref, snapshot, subscribe, useSnapshot } from "valtio"
import { CheckRoot } from "@/components"
import { Panel } from "@/components/common"
import { useInit } from "@/hooks/useInitRef"
import { useEffect, useEffectEvent, useRef } from "react"
import { AnimatePresence, motion } from "motion/react"

const store = proxy({
	someState: "Hello",
	items: [] as unknown[],
	value: 0,
	aref: ref({ value: "nerd" }),
})

class Something {
	state = proxy({
		value: 0,
		butts: "",
	})

	constructor(value: number, butts: string) {
		this.state.value = value
		this.state.butts = butts
	}

	doSomethingWIthAButt() {
		this.state.value = this.state.butts.length
		this.state.butts = `${this.state.butts} ${this.state.butts}`
	}

	useSnap() {
		return useSnapshot(this.state)
	}
}

function proxyWithUpdater(value: string) {
	const p = proxy({
		value,
		updateValue: (value: string) => {
			p.value += ` ${value}`
		},
	})
	return p
}

const something = new Something(0, "butts")
// don't destructure classes :)

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

	const pwv = useInit(() => proxyWithUpdater("hello"))
	const spw = useSnapshot(pwv)

	const snap = useSnapshot(store)
	const snap2 = something.useSnap()
	const toggle = snap.value % 2 === 0
	return (
		<CheckRoot width={"full"} height={"full"}>
			<VStack width={"full"} height={"full"} justifyContent={"center"}>
				<Panel>
					{snap.value}
					{snap.items.toString()}
					<Box>{snap2.value}</Box>
					<Box>{snap2.butts}</Box>
					<Box>{snap.aref.value}</Box>
					<Button
						onClick={() => {
							store.aref = ref({ value: "cool" })
						}}
					>
						aref
					</Button>
				</Panel>
				<Box onClick={() => pwv.updateValue("there")}>{spw.value}</Box>
				<HStack>
					<Box
						borderColor={"2px dotted blue"}
						padding="8px"
						margin="8px"
						width={"100px"}
						height={"100px"}
					>
						<AnimatePresence mode="sync">
							{toggle && (
								<motion.div
									style={{
										width: "100%",
										height: "100%",
										backgroundColor: "#0000ff77",
										alignContent: "center",
										textAlign: "center",
									}}
									key={snap.value}
									layout
									layoutId={"hello"}
									transition={{ duration: 0.9 }}
								>
									Hello
								</motion.div>
							)}
						</AnimatePresence>
					</Box>
					<Box
						borderColor={"2px dotted red"}
						padding="8px"
						margin="8px"
						width={"100px"}
						height={"100px"}
					>
						<AnimatePresence mode="sync">
							<motion.div
								style={{
									width: "100%",
									height: "100%",
									backgroundColor: "#ff000077",
									alignContent: "center",
									textAlign: "center",
								}}
								animate={{ visibility: !toggle ? "visible" : "hidden" }}
								key={snap.value + 1}
								layout
								layoutId={"hello"}
								transition={{ duration: 0.9 }}
							>
								Hello
							</motion.div>
						</AnimatePresence>
					</Box>
				</HStack>
				<BButton
					onClick={() => {
						store.value++
					}}
				>
					Change
				</BButton>
			</VStack>
		</CheckRoot>
	)
}

function BButton(props: ChakraProps) {
	const { children, ...restProps } = props
	return (
		<Box position={"relative"} bgColor={"blue.500"} padding={3} color={"white"} asChild>
			<motion.div whileTap={{ scale: 0.9 }}>
				{/* <motion.button whileTap={{ scale: 0.9 }}>{props.children}</motion.button> */}
				<Button
					_after={{
						content: '""',
						position: "absolute",
						bottom: 0,
						left: 0,
						width: "30%",
						height: "full",
						zIndex: 10,
						bgColor: "red.500/80",
						transition: "left 0.2s ease-in-out",
					}}
					_hover={{
						_after: {
							left: "70%",
						},
					}}
					{...restProps}
				>
					{children}
				</Button>
			</motion.div>
		</Box>
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
