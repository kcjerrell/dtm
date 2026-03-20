import { Box, HStack, Spinner } from "@chakra-ui/react"
import type { Snapshot } from "valtio"
import { PanelListItem } from "@/components"
import type { ProjectState } from "@/dtProjects/state/projects"

export interface ProjectListItemProps extends Omit<ChakraProps, "onContextMenu"> {
    project: Snapshot<ProjectState>
    altCount?: number
    onContextMenu?: (e: React.MouseEvent) => void
}
function ProjectListItem(props: ProjectListItemProps) {
    const { project, altCount, onContextMenu, ...restProps } = props

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
            data-selected={project.selected || undefined}
            position={"relative"}
            selectable
            selected={project.selected}
            asChild
            onClick={(e) => project.onClick(e)}
            onContextMenu={(e) => {
                if (!project.selected) project.onClick()
                onContextMenu?.(e)
            }}
            {...restProps}
        >
            <HStack justifyContent={"space-between"}>
                {/* <Box margin={0} scale={1.25}>
                    <PiImage />
                </Box> */}

                <Box flex={"1 1 auto"}>
                    {projectName}
                    {project.isMissing && " (missing)"}
                </Box>
                <Box color={"fg.3"} fontStyle={countStyle} fontVariantNumeric={"tabular-nums"}>
                    {project.isScanning ? <Spinner size={"xs"} /> : count}
                </Box>
            </HStack>
        </PanelListItem>
    )
}

export default ProjectListItem
