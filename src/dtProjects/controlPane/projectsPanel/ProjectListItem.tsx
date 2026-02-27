import { Box, HStack } from "@chakra-ui/react"
import type { Snapshot } from "valtio"
import { PanelListItem } from "@/components"
import type { ProjectState } from "@/dtProjects/state/projects"

export interface ProjectListItemProps extends ChakraProps {
    project: Snapshot<ProjectState>
    altCount?: number
}
function ProjectListItem(props: ProjectListItemProps) {
    const { project, altCount, ...restProps } = props

    let count: number | string = project.image_count ?? 0
    let countStyle: string | undefined
    if (altCount !== count) {
        count = altCount || ""
        countStyle = "italic"
    }

    const projectName = project.path.split("/").pop()?.slice(0, -8)

    return (
        <PanelListItem
            role={"option"}
            aria-selected={project.selected}
            data-test-id={`project-item`}
            data-project-id={project.id}
            position={"relative"}
            selectable
            selected={project.selected}
            asChild
            onClick={(e) => project.onClick(e)}
            {...restProps}
            // {...handlers}
        >
            <HStack justifyContent={"space-between"}>
                <Box flex={"1 1 auto"}>
                    {projectName}
                    {project.isMissing && " (missing)"}
                </Box>
                <Box color={"fg.3"} fontStyle={countStyle} fontVariantNumeric={"tabular-nums"}>
                    {count}
                </Box>
            </HStack>
        </PanelListItem>
    )
}

export default ProjectListItem
