import { Box, FormatByte, HStack } from "@chakra-ui/react"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { derive } from "derive-valtio"
import { useEffect, useRef, useState } from "react"
import { FiFolder, FiRefreshCw } from "react-icons/fi"
import { MdBlock } from "react-icons/md"
import { useSnapshot } from "valtio"
import { pdb } from "@/commands"
import { PanelListItem } from "@/components"
import PanelList, { type PanelListCommand } from "@/components/PanelList"
import { useSelectable } from "@/hooks/useSelectableV"
import TabContent from "@/metadata/infoPanel/TabContent"
import { useDTP } from "../state/context"
import type ProjectsController from "../state/projects"
import type { ProjectState } from "../state/projects"

interface ProjectsPanelComponentProps extends ChakraProps {}

function ProjectsPanel(props: ProjectsPanelComponentProps) {
	const { ...restProps } = props
	// const { snap, state, store } = useDTProjects()
	const { projects } = useDTP()
	const [showExcluded, setShowExcluded] = useState(false)
	const toggleRef = useRef<HTMLDivElement>(null)

	const groups = derive({
		activeProjects: (get) => get(projects.state).projects.filter((p) => !p.excluded),
		excludedProjects: (get) => get(projects.state).projects.filter((p) => p.excluded),
		allProjects: (get) =>
			get(projects.state).projects.toSorted(
				(a, b) => (a.excluded ? 1 : -1) - (b.excluded ? 1 : -1),
			),
	})

	const activeProjectsSnap = useSnapshot(groups.activeProjects)
	const excludedProjectsSnap = useSnapshot(groups.excludedProjects)

	useEffect(() => {
		if (showExcluded && toggleRef.current) {
			setTimeout(() => {
				toggleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
			}, 100)
		}
	}, [showExcluded])

	return (
		<TabContent
			height={"100%"}
			value={"projects"}
			contentProps={{ maxHeight: "100%", overflowY: "clip" }}
			{...restProps}
		>
			<PanelList
				maxHeight={"100%"}
				itemsState={showExcluded ? groups.allProjects : groups.activeProjects}
				keyFn={(p) => p.path}
				commands={toolbarCommands}
				onSelectionChanged={(e) => {
					projects.setSelectedProjects(e)
				}}
			>
				{activeProjectsSnap.map((p) => (
					<ProjectListItem key={p.path} project={p} />
				))}
				{excludedProjectsSnap.length > 0 && (
					<PanelListItem
						ref={toggleRef}
						onClick={() => setShowExcluded(!showExcluded)}
						cursor="pointer"
						color="fg.3"
						_hover={{ color: "fg.1" }}
					>
						<HStack>
							<Box as={showExcluded ? FiRefreshCw : MdBlock} />
							<Box>
								{showExcluded
									? "Hide excluded projects"
									: `Show excluded projects (${excludedProjectsSnap.length})`}
							</Box>
						</HStack>
					</PanelListItem>
				)}
				{showExcluded &&
					excludedProjectsSnap.map((p) => <ProjectListItem key={p.path} project={p} />)}
			</PanelList>

			<HStack color={"fg.2"} justifyContent={"space-between"} px={3} py={1}>
				<Box>{groups.activeProjects.length} projects</Box>

				<Box>{groups.activeProjects.reduce((p, c) => p + c.image_count, 0)} images</Box>
				<Box>
					<FormatByte value={groups.activeProjects.reduce((p, c) => p + c.filesize, 0)} />
				</Box>
			</HStack>
		</TabContent>
	)
}

const toolbarCommands: PanelListCommand<ProjectState, ProjectsController>[] = [
	{
		id: "exclude",
		getTip: (selected) => (selected[0]?.excluded ? "Include project" : "Exclude project"),
		tipText: "Excluded projects will not be scanned and their images won't be listed.",
		getIcon: (selected) => (selected[0]?.excluded ? FiRefreshCw : MdBlock),
		onClick: (selected, context?: ProjectsController) => {
			context?.setExclude(selected, !selected[0]?.excluded)
		},
		requiresSelection: true,
	},
	{
		id: "openFolder",
		tipTitle: "Open folder",
		tipText: "Open project folder in file manager.",
		icon: FiFolder,
		onClick: async (selected) => {
			await revealItemInDir(selected.map((f) => f.path))
		},
		requiresSelection: true,
	},
]

export default ProjectsPanel

interface ProjectListItemProps extends ChakraProps {
	project: ProjectState
	altCount?: number
}
function ProjectListItem(props: ProjectListItemProps) {
	const { project, altCount, ...restProps } = props
	const { handlers, isSelected } = useSelectable(project)

	let count: number | string = project.image_count
	let countStyle: string | undefined

	if (altCount !== undefined) {
		count = altCount || ""
		countStyle = "italic"
	}

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
				{project.isScanning ? (
					<Box color={"fg.3"}>-</Box>
				) : (
					<Box color={"fg.3"} fontStyle={countStyle}>
						{count}
					</Box>
				)}
			</HStack>
		</PanelListItem>
	)
}
