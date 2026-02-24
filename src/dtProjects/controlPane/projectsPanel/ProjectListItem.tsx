import { Box, HStack } from "@chakra-ui/react"
import { PanelListItem } from "@/components"
import type { ProjectState } from "@/dtProjects/state/projects"
import { useSelectable } from "@/hooks/useSelectableV"

export interface ProjectListItemProps extends ChakraProps {
    project: ProjectState
    altCount?: number
}
function ProjectListItem(props: ProjectListItemProps) {
    const { project, altCount, ...restProps } = props
    const { handlers, isSelected } = useSelectable(project)

    let count: number | string = project.image_count ?? 0
    let countStyle: string | undefined
    if (altCount !== count) {
        count = altCount || ""
        countStyle = "italic"
    } // what if every image in the project matches a search?	then it won't be italic

    const projectName = project.path.split("/").pop()?.slice(0, -8)

    return (
        <PanelListItem
            role={"option"}
            aria-selected={isSelected}
            data-test-id={`project-item`}
            data-project-id={project.id}
            position={"relative"}
            selectable
            selected={isSelected}
            asChild
            {...restProps}
            {...handlers}
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
