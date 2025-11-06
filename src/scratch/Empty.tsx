import { Box, VStack } from "@chakra-ui/react"
import { proxy, useSnapshot } from "valtio"
import { CheckRoot } from "@/components"
import { Panel } from '@/components/common'

const store = proxy({
	someState: "Hello",
})

function Empty(props) {
	const snap = useSnapshot(store)

	return (
		<CheckRoot width={'full'} height={'full'}>
			<VStack width={"full"} height={"full"} justifyContent={"center"}>
				<Panel>{snap.someState}</Panel>
			</VStack>
		</CheckRoot>
	)
}

export default Empty
