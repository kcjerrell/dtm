import { Flex, ScrollArea } from "@chakra-ui/react"
import { store } from "@tauri-store/valtio"
import JsonView from "@uiw/react-json-view"
import { useSnapshot } from "valtio"

export const devStore = store(
	"dev",
	{},
	{
		save: false,
		sync: true,
		syncStrategy: "debounce",
		syncInterval: 200,
	},
)
devStore.start()

interface DevComponentProps extends ChakraProps {}

function Dev(props: DevComponentProps) {
	const { ...boxProps } = props

	const snap = useSnapshot(devStore.state)

	return (
		<ScrollArea.Root>
			<ScrollArea.Viewport asChild>
				<Flex width={"100vw"} height={"100vh"} {...boxProps}>
					<ScrollArea.Content asChild>
						<JsonView
							objectSortKeys={true}
							// collapsed={4}
							displayDataTypes={false}
							shouldExpandNodeInitially={(
								isExpanded,
								{ keys, level, keyName, value, parentValue },
							) => {
								if (Array.isArray(value)) return false
								return true
							}}
							value={snap}
						/>
					</ScrollArea.Content>
				</Flex>
			</ScrollArea.Viewport>
		</ScrollArea.Root>
	)
}

export default Dev
