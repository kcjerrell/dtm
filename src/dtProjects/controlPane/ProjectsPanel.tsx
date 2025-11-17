import { Box, FormatByte, HStack } from "@chakra-ui/react"
import { FiFolder, FiRefreshCw } from "react-icons/fi"
import { MdBlock } from "react-icons/md"
import { type ProjectExtra, pdb } from "@/commands"
import { PaneListContainer, PanelListItem } from "@/components"
import ToolbarItem from "@/components/ToolbarItem"
import { useSelectable, useSelectableGroup } from "@/hooks/useSelectable"
import TabContent from "@/metadata/infoPanel/TabContent"
import type { ToolbarCommand } from "@/metadata/toolbar/commands"
import DTProjects, { type DTProjectsStateType, useDTProjects } from "../state/projectStore"
import type { ProjectState } from "../state/projects"

interface ProjectsPanelComponentProps extends ChakraProps {}

function ProjectsPanel(props: ProjectsPanelComponentProps) {
	const { ...restProps } = props
	const { snap, state } = useDTProjects()

	const { SelectableGroup, selectedItems } = useSelectableGroup<ProjectExtra>({
		mode: "multipleModifier",
		keyFn: (p) => p.path,
	})

	const selectionEmpty = !selectedItems.length

	return (
		<TabContent
			value={"projects"}
			contentProps={{ maxHeight: "100%", overflowY: "clip" }}
			{...restProps}
		>
			<HStack justifyContent={"flex-end"} transition={"all 0.2s ease"}>
				{toolbarCommands.map((command) => (
					<ToolbarItem
						key={command.id}
						command={command}
						state={state as DTProjectsStateType}
						arg={selectedItems as ProjectExtra[]}
					/>
				))}
				{/* <ToolbarButton icon={MdBlock} tip={"Exclude project"} />
				<ToolbarButton icon={FiRefreshCw} tip={"Manual rescan"} />
				<ToolbarButton icon={FiFolder} tip={"Open folder"} /> */}
			</HStack>
			<PaneListContainer overflowY={"auto"} className="hide-scrollbar">
				<SelectableGroup
					onSelectionChanged={(e) => {
						DTProjects.setImagesSource({ projects: e })
					}}
				>
					{snap.projects.map((project) => (
						<ProjectListItem key={project.path} project={project} />
					))}
				</SelectableGroup>
			</PaneListContainer>

			<HStack color={"fg.2"} justifyContent={"space-between"} px={3} py={1}>
				<Box>{snap.projects.length} projects</Box>

				<Box>{snap.projects.reduce((p, c) => p + c.image_count, 0)} images</Box>
				<Box>
					<FormatByte value={snap.projects.reduce((p, c) => p + c.filesize, 0)} />
				</Box>
			</HStack>
		</TabContent>
	)
}

const toolbarCommands: ToolbarCommand<DTProjectsStateType, ProjectExtra[]>[] = [
	{
		id: "exclude",
		tip: "Exclude project",
		icon: MdBlock,
		action: (snap) => {},
		check: (_snap, selected) => !!selected && selected?.length > 0,
	},
	{
		id: "rescan",
		tip: "Manual rescan",
		icon: FiRefreshCw,
		action: () => {},
		check: (_snap, selected) => !!selected && selected?.length > 0,
	},
	{
		id: "openFolder",
		tip: "Open folder",
		icon: FiFolder,
		action: () => {},
		check: (_snap, selected) => !!selected && selected?.length === 1,
	},
]

export default ProjectsPanel

interface ProjectListItemProps extends ChakraProps {
	project: ProjectState
}
function ProjectListItem(props: ProjectListItemProps) {
	const { project, ...restProps } = props
	const { handlers, isSelected } = useSelectable(project)
	return (
		<PanelListItem
			position={"relative"}
			selectable
			selected={isSelected}
			asChild
			{...restProps}
			{...handlers}
			onContextMenu={() => pdb.scanProject(project.path, true)}
		>
			<HStack justifyContent={"space-between"}>
				<Box flex={"1 1 auto"}>{project.path.split("/").pop()?.slice(0, -8)}</Box>
				{project.isScanning ? <Box>-</Box> : <Box>{project.image_count}</Box>}
			</HStack>
		</PanelListItem>
	)
}
