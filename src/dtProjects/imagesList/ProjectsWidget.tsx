import { plural } from "@/utils/helpers"
import { useDTP } from "../state/context"
import SearchChip from "./SearchChip"

interface ProjectsWidgetProps extends ChakraProps {}

function ProjectsWidget(props: ProjectsWidgetProps) {
    const { ...restProps } = props

    const { projects, uiState } = useDTP()
    const pSnap = projects.useSnap()

    const projectsCount = pSnap.selectedProjects.length

    if (!projectsCount) return null

    return (
        <SearchChip
            onClick={() => {
                uiState.setSelectedTab("projects")
            }}
            onClickX={() => {
                projects.setSelectedProjects([])
            }}
            {...restProps}
        >
            {projectsCount} {plural(projectsCount, "project")}
        </SearchChip>
    )
}

export default ProjectsWidget
