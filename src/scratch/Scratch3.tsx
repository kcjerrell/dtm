import { Box, Button, HStack, Input, VStack } from "@chakra-ui/react"
import { proxy, useSnapshot } from "valtio"
import { CheckRoot } from "@/components"
import { Panel } from "@/components/common"
import { getClipboardTypes } from "@/utils/clipboard"

// for determining pasteboard types

let idCounter = 0
type PBTypesEntry = {
	id: number
	label?: string
	types: string[]
}

const store = proxy({
	entries: [] as PBTypesEntry[],
	labelInput: "",
})

function Empty(props) {
	const snap = useSnapshot(store)

	return (
		<CheckRoot
			width={"full"}
			height={"full"}
			onDrop={(e) => e.preventDefault()}
			onDragOver={(e) => e.preventDefault()}
		>
			<VStack width={"full"} height={"full"} justifyContent={"center"}>
				<Panel flexDir={"row"}>
					<Input
						value={snap.labelInput}
						onChange={(e) => {
							store.labelInput = e.target.value
						}}
					/>
					<Button
						onClick={async () => {
							const types = await getClipboardTypes("general")
							store.entries.push({ id: idCounter++, label: snap.labelInput, types })
						}}
					>
						Paste
					</Button>
					<Button
						onClick={async () => {
							const types = await getClipboardTypes("drag")
							store.entries.push({ id: idCounter++, label: snap.labelInput, types })
						}}
					>
						Drop
					</Button>
				</Panel>
				<Box maxWidth={'95vw'} overflowX={"scroll"}>
					<HStack>
						{snap.entries.map((e) => (
							<Panel key={e.id} flexDir={"column"}>
								{e.label}
								{e.types.map((t) => (
									<Box key={t}>{t}</Box>
								))}
							</Panel>
						))}
					</HStack>
				</Box>
				<Panel>
					<Button
						onClick={() => {
							console.dir(toJSON(store.entries))
						}}
					>
						Log
					</Button>
				</Panel>
			</VStack>
		</CheckRoot>
	)
}

export default Empty
