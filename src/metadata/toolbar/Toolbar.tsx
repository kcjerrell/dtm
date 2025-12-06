import { Box } from "@chakra-ui/react"
import { AnimatePresence, LayoutGroup, motion } from "motion/react"
import { useSnapshot } from "valtio"
import { useMessages } from "@/context/Messages"
import { MetadataStore } from "../state/store"
import { toolbarCommands } from "./commands"
import { ContentHeaderContainer, ToolbarButtonGroup, ToolbarContainer, ToolbarRoot } from "./parts"
import ToolbarItem from "./ToolbarItem"
import UpgradeButton from "./UpgradeButton"

function Toolbar(props: ChakraProps) {
	const { ...restProps } = props

	const snap = useSnapshot(MetadataStore)

	const messageChannel = useMessages("toolbar")

	// used when rendering command items
	// let changedCount = 0
	// const prevState = useRef<string[]>(toolbarCommands.map((item) => "hide"))

	const buttons = toolbarCommands.map((item) => {
		if (item.separator) return () => null
		const isVisible = item.check?.(snap) ?? true
		const state = isVisible ? "show" : "hide"
		// const isChanged = prevState.current[i] !== state
		// prevState.current[i] = state
		// const order = isChanged ? changedCount++ : undefined

		let key = item.id
		if (item.slotId && isVisible) key = item.slotId

		return () => <ToolbarItem key={key} command={item} state={state} />
	})

	return (
		<ContentHeaderContainer data-tauri-drag-region {...restProps}>
			<ToolbarContainer>
				<ToolbarRoot borderBottom={messageChannel.messages.length ? "0px" : "1px"}>
					<ToolbarButtonGroup layout={"size"} transition={{ duration: 0.2, ease: "easeOut" }}>
						<LayoutGroup>
							<AnimatePresence mode={"sync"} propagate={false}>
								{buttons.map((render) => render())}
							</AnimatePresence>
						</LayoutGroup>
					</ToolbarButtonGroup>
					<AnimatePresence>
						{messageChannel.messages.map((message, i, msgs) => (
							<Box
								asChild
								key={`msg_${message.id}`}
								_before={
									i > 0 && msgs.length > 1
										? {
												content: '""',
												display: "block",
												height: "1px",
												width: "70%",
												bg: "fg.1/50",
												marginX: "auto",
											}
										: undefined
								}
								overflow={"hidden"}
								maxWidth={"100%"}
							>
								<motion.div
									initial={{ opacity: 0, height: 0 }}
									animate={{ opacity: 1, height: "auto" }}
									exit={{ opacity: 0, height: 0 }}
									transition={{ duration: 0.1 }}
								>
									<Box p={1} width={"100%"} textAlign={"center"} fontSize={"sm"} color={"fg.2"}>
										{message.message}
									</Box>
								</motion.div>
							</Box>
						))}
					</AnimatePresence>
				</ToolbarRoot>
			</ToolbarContainer>
		</ContentHeaderContainer>
	)
}

export default Toolbar
