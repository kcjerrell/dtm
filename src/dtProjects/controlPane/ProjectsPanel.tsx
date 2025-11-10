import TabContent from "@/metadata/infoPanel/TabContent"
import { useUiState } from "@/metadata/state/uiState"
import { Progress } from "@chakra-ui/react"
import DTProjects, { useDTProjects } from "../state/projectStore"
import { PaneListContainer, PanelListItem } from "@/components"
import { useSelectable, useSelectableGroup } from "@/hooks/useSelectable"
import { DTProject } from "../types"

interface ProjectsPanelComponentProps extends ChakraProps {}

function ProjectsPanel(props: ProjectsPanelComponentProps) {
	const { ...restProps } = props
	const { snap } = useDTProjects()

	const { SelectableGroup, selectedItems } = useSelectableGroup<DTProject>({
		mode: "multipleModifier",
		keyFn: (p) => p.path,
	})

	return (
		<TabContent value={"projects"} {...restProps}>
			<PaneListContainer>
				<SelectableGroup
					onSelectionChanged={(e) => {
						console.log(toJSON(e))
						DTProjects.setImagesSource({ projects: e })
					}}
				>
					{snap.projects.map((project) => (
						<ProjectListItem key={project.path} project={project} />
					))}
				</SelectableGroup>
			</PaneListContainer>
			{snap.scanProgress !== -1 && (
				<Progress.Root
					key={snap.scanningProject}
					value={snap.scanProgress}
					size={"md"}
					marginBottom={0}
					marginTop={"auto"}
					flex={"0 0 auto"}
				>
					<Progress.Track>
						<Progress.Range />
					</Progress.Track>
				</Progress.Root>
			)}
		</TabContent>
	)
}

export default ProjectsPanel

interface ProjectListItemProps extends ChakraProps {
	project: DTProject
}
function ProjectListItem(props: ProjectListItemProps) {
	const { project, ...restProps } = props
	const { handlers, isSelected } = useSelectable(project)
	return (
		<PanelListItem selectable selected={isSelected} {...restProps} {...handlers}>
			{project.path.split("/").pop()?.slice(0, -8)}
		</PanelListItem>
	)
}
