import { HStack } from "@chakra-ui/react"
import {
	PaneListContainer,
	PanelButton,
	PanelListItem,
	PanelSectionHeader,
	SliderWithInput,
} from "@/components"
import { useSelectable, useSelectableGroup } from "@/hooks/useSelectable"
import TabContent from "@/metadata/infoPanel/TabContent"
import { openAnd } from "@/utils/helpers"
import { useDTProjects } from "../state/projectStore"
import { Slider } from "@/components/ui/slider"

interface SettingsPanelComponentProps extends ChakraProps {}

function SettingsPanel(props: SettingsPanelComponentProps) {
	const { ...restProps } = props
	const { snap, store } = useDTProjects()

	const { SelectableGroup, selectedItems } = useSelectableGroup({ mode: "multipleModifier" })

	console.log("render")
	return (
		<TabContent value={"settings"} {...restProps}>
			<PanelSectionHeader>Watch Folders</PanelSectionHeader>
			<PaneListContainer>
				<SelectableGroup>
					{snap.watchFolders.map((folder, i) => (
						<WatchFolderItem key={folder.path} folder={folder.path} />
					))}
				</SelectableGroup>
				<HStack justifyContent={"flex-end"}>
					<PanelButton
						tone={"danger"}
						display={!selectedItems.length ? "none" : "flex"}
						onClick={() => store.watchFolders.removeWatchFolders(selectedItems as string[])}
					>
						Remove
					</PanelButton>
					<PanelButton
						onClick={() =>
							openAnd(store.watchFolders.addWatchFolder, {
								directory: true,
								multiple: false,
								title: "Select folder",
							})
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
			<PanelButton onClick={() => store.watchFolders.addDefaultWatchFolder()}>
				Add default folder
			</PanelButton>
			<Slider
				min={100}
				max={500}
				value={[snap.itemSize]}
				onValueChange={(value) => store.setItemSize(value.value[0])}
			/>
		</TabContent>
	)
}

function WatchFolderItem(props: { folder: string }) {
	const { folder } = props
	const { isSelected, handlers } = useSelectable(folder, false)

	return (
		<PanelListItem key={folder} selectable selected={isSelected} {...handlers}>
			{folder}
		</PanelListItem>
	)
}

export default SettingsPanel
