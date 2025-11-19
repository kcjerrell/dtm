import { FaMinus, FaPlus } from "react-icons/fa6"
import { FiList } from "react-icons/fi"
import { LuFolderTree } from "react-icons/lu"
import { PanelButton, PanelListItem, PanelSectionHeader } from "@/components"
import PanelList, { type PanelListCommand } from "@/components/PanelList"
import { Slider } from "@/components/ui/slider"
import { useInitRef } from '@/hooks/useInitRef'
import { useSelectable } from "@/hooks/useSelectableV"
import TabContent from "@/metadata/infoPanel/TabContent"
import { openAnd } from "@/utils/helpers"
import { type IDTProjectsStore, useDTProjects } from "../state/projectStore"
import type { WatchFolderState } from "../state/watchFolders"

function getCommands(folderType: "Projects" | "ModelInfo", store: IDTProjectsStore): PanelListCommand<WatchFolderState>[] {
	const ft = folderType === "Projects" ? "proj" : "modinfo"
return [
			{
				id: `${ft}-toggle-recursive`,
				getIcon: (selected) => (selected[0]?.recursive ? FiList : LuFolderTree),
				requiresSelection: true,
				onClick: (selected) => {
					store.watchFolders.setRecursive(selected, !selected[0]?.recursive)
				},
				getTip: (selected) => (selected[0]?.recursive ? "Disable recursive" : "Enable recursive"),
			},
			{
				id: `${ft}-remove-folders`,
				icon: FaMinus,
				requiresSelection: true,
				onClick: (selected) => {
					store.watchFolders.removeWatchFolders(selected)
				},
				tip: "Remove selected folders",
			},
			{
				id: `${ft}-add-folder`,
				icon: FaPlus,
				onClick: () =>
					openAnd((f) => store.watchFolders.addWatchFolder(f, folderType), {
						directory: true,
						multiple: false,
						title: `Select ${folderType.toLowerCase()} folder`,
					}),
				tip: "Add folder",
			},
		]
}

interface SettingsPanelComponentProps extends ChakraProps {}

function SettingsPanel(props: SettingsPanelComponentProps) {
	const { ...restProps } = props
	const { snap, store } = useDTProjects()

	const { hasModelInfoDefault, hasProjectDefault, modelInfoFolders, projectFolders } =
		snap.watchFolders

	const projectFolderCommands = useInitRef(() => getCommands("Projects", store))
	const modelInfoFolderCommands = useInitRef(() => getCommands("ModelInfo", store))

	return (
		<TabContent value={"settings"} {...restProps}>
			<PanelList
				getItems={() => store.watchFolders.state.projectFolders}
				itemsSnap={projectFolders}
				header={"Project locations"}
				headerInfo={"hi"}
				commands={projectFolderCommands}
				keyFn={(item) => item.id}
				clearSelection={modelInfoFolders.some(f => f.selected)}
			>
				{projectFolders.map((folder) => (
					<WatchFolderItem key={folder.id} folder={folder} />
				))}
			</PanelList>

			{!hasProjectDefault && (
				<PanelButton
					margin={2}
					onClick={() => store.watchFolders.addDefaultWatchFolder("Projects")}
				>
					Add default location
				</PanelButton>
			)}

			<PanelList
				marginTop={4}
				getItems={() => store.watchFolders.state.modelInfoFolders}
				itemsSnap={modelInfoFolders}
				header={"Model info"}
				headerInfo={"hi"}
				commands={modelInfoFolderCommands}
				keyFn={(item) => item.id}
				clearSelection={projectFolders.some(f => f.selected)}
			>
				{modelInfoFolders.map((folder) => (
					<WatchFolderItem key={folder.id} folder={folder} />
				))}
			</PanelList>

			{!hasModelInfoDefault && (
				<PanelButton
					margin={2}
					onClick={() => store.watchFolders.addDefaultWatchFolder("ModelInfo")}
				>
					Add default locations
				</PanelButton>
			)}

			<PanelSectionHeader marginTop={4}>Thumbnail size</PanelSectionHeader>
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
	const { folder, ...restProps } = props
	const { isSelected, handlers } = useSelectable(folder)

	return (
		<PanelListItem key={folder.id} selectable selected={isSelected} {...restProps} {...handlers}>
			<span>
				{folder.path}
				{folder.recursive && <LuFolderTree style={{ display: "inline", marginLeft: "0.5rem" }} />}
			</span>
		</PanelListItem>
	)
}

export default SettingsPanel
