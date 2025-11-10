import { PanelButton, PaneListContainer, PanelListItem, PanelSectionHeader } from "@/components"
import { useSelectable, useSelectableGroup } from "@/hooks/useSelectable"
import TabContent from "@/metadata/infoPanel/TabContent"
import { openAnd } from "@/utils/helpers"
import { Box, HStack, VStack } from "@chakra-ui/react"
import { useDTProjects } from "../state/projectStore"
import { addDefaultWatchFolder, addWatchFolder, removeWatchFolders } from "../state/watchFolders"

interface SettingsPanelComponentProps extends ChakraProps {}

function SettingsPanel(props: SettingsPanelComponentProps) {
	const { ...restProps } = props
	const { snap } = useDTProjects()

	const { SelectableGroup, selectedItems } = useSelectableGroup({ mode: "multipleModifier" })

	console.log("render")
	return (
		<TabContent value={"settings"} {...restProps}>
			<PanelSectionHeader>Watch Folders</PanelSectionHeader>
			<PaneListContainer>
				<SelectableGroup>
					{snap.watchFolders.map((folder, i) => (
						<WatchFolderItem key={folder} folder={folder} />
					))}
				</SelectableGroup>
				<HStack justifyContent={"flex-end"}>
					<PanelButton
						tone={"danger"}
						display={!selectedItems.length ? "none" : "flex"}
						onClick={() => removeWatchFolders(selectedItems)}
					>
						Remove
					</PanelButton>
					<PanelButton
						onClick={() =>
							openAnd(addWatchFolder, { directory: true, multiple: false, title: "Select folder" })
						}
					>
						Add
					</PanelButton>
				</HStack>
				{/* <VStack>
					{selectedItems.map((item) => (
						<Box key={item}>{item}</Box>
					))}
				</VStack> */}
			</PaneListContainer>
			<PanelButton onClick={() => addDefaultWatchFolder()}>Add default folder</PanelButton>
		</TabContent>
	)
}

function WatchFolderItem(props) {
	const { folder } = props
	const { isSelected, handlers } = useSelectable(folder, false)

	return (
		<PanelListItem key={folder} selectable selected={isSelected} {...handlers}>
			{folder}
		</PanelListItem>
	)
}

export default SettingsPanel
