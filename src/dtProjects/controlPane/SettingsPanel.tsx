import { HStack, Text } from "@chakra-ui/react"
import {
	IconButton,
	PaneListContainer,
	PanelButton,
	PanelListItem,
	PanelSectionHeader,
	Tooltip,
} from "@/components"
import { useSelectable, useSelectableGroup } from "@/hooks/useSelectable"
import TabContent from "@/metadata/infoPanel/TabContent"
import { openAnd } from "@/utils/helpers"
import { useDTProjects } from "../state/projectStore"
import { Slider } from "@/components/ui/slider"
import { useSnapshot } from "valtio"
import { PiInfo } from "react-icons/pi"
import { FaMinus, FaPlus } from "react-icons/fa6"
import ToolbarButton from "@/metadata/toolbar/ToolbarButton"
import { WatchFolderState } from "../state/watchFolders"

interface SettingsPanelComponentProps extends ChakraProps {}

function SettingsPanel(props: SettingsPanelComponentProps) {
	const { ...restProps } = props
	const { snap, store } = useDTProjects()

	const { hasModelInfoDefault, hasProjectDefault, modelInfoFolders, projectFolders } =
		snap.watchFolders

	const { SelectableGroup: ProjectFolderGroup, selectedItems: selectedProjectFolders } =
		useSelectableGroup<WatchFolderState>({ mode: "multipleModifier" })
	const { SelectableGroup: ModelInfoGroup, selectedItems: selectedModelInfoFolders } =
		useSelectableGroup<WatchFolderState>({ mode: "multipleModifier" })

	return (
		<TabContent value={"settings"} {...restProps}>
			<PanelSectionHeader>
				Project locations
				<Tooltip tip={"hi"}>
					<PiInfo />
				</Tooltip>
			</PanelSectionHeader>
			<PaneListContainer>
				<ProjectFolderGroup>
					{projectFolders.map((folder) => (
						<WatchFolderItem key={folder.id} folder={folder} />
					))}
					{!projectFolders.length && (
						<PanelListItem bgColor={"transparent"} fontStyle={"italic"} textAlign={"center"}>
							No folders added
						</PanelListItem>
					)}
				</ProjectFolderGroup>
				<HStack justifyContent={"flex-end"}>
					<IconButton
						size={"sm"}
						disabled={selectedProjectFolders.length === 0}
						onClick={() => {
							store.watchFolders.removeWatchFolders(selectedProjectFolders)
						}}
					>
						<FaMinus />
					</IconButton>
					<IconButton
						size={"sm"}
						onClick={() =>
							openAnd((f) => store.watchFolders.addWatchFolder(f, "Projects"), {
								directory: true,
								multiple: false,
								title: "Select projects folder",
							})
						}
					>
						<FaPlus />
					</IconButton>
					{/* <PanelButton
						onClick={() =>
							openAnd(store.watchFolders.addWatchFolder, {
								directory: true,
								multiple: false,
								title: "Select folder",
							})
						}
					>
						Add folder
					</PanelButton> */}
				</HStack>
			</PaneListContainer>

			{!hasProjectDefault && (
				<PanelButton
					margin={2}
					onClick={() => store.watchFolders.addDefaultWatchFolder("Projects")}
				>
					Add default location
				</PanelButton>
			)}

			<PanelSectionHeader marginTop={8}>
				Model info
				<Tooltip tip={"hi"}>
					<PiInfo />
				</Tooltip>
			</PanelSectionHeader>
			<PaneListContainer>
				<ModelInfoGroup>
					{modelInfoFolders.map((folder) => (
						<WatchFolderItem key={folder.id} folder={folder} />
					))}
					{!modelInfoFolders.length && (
						<PanelListItem bgColor={"transparent"} fontStyle={"italic"} textAlign={"center"}>
							No folders added
						</PanelListItem>
					)}
				</ModelInfoGroup>
				<HStack justifyContent={"flex-end"}>
					<IconButton
						size={"sm"}
						disabled={selectedModelInfoFolders.length === 0}
						onClick={() => {
							store.watchFolders.removeWatchFolders(selectedModelInfoFolders)
						}}
					>
						<FaMinus />
					</IconButton>
					<IconButton
						size={"sm"}
						onClick={() =>
							openAnd((f) => store.watchFolders.addWatchFolder(f, "ModelInfo"), {
								directory: true,
								multiple: false,
								title: "Select models folder",
							})
						}
					>
						<FaPlus />
					</IconButton>
				</HStack>
			</PaneListContainer>
			{!hasModelInfoDefault && (
				<PanelButton
					margin={2}
					onClick={() => store.watchFolders.addDefaultWatchFolder("ModelInfo")}
				>
					Add default locations
				</PanelButton>
			)}

			<Slider
				min={100}
				max={500}
				value={[snap.itemSize]}
				onValueChange={(value) => store.setItemSize(value.value[0])}
			/>
		</TabContent>
	)
}

function WatchFolderItem(props: { folder: WatchFolderState }) {
	const { folder } = props
	const { isSelected, handlers } = useSelectable(folder, false)

	return (
		<PanelListItem key={folder.id} selectable selected={isSelected} {...handlers}>
			{folder.path}
		</PanelListItem>
	)
}

export default SettingsPanel
