import { Box, HStack, Spinner } from "@chakra-ui/react"
import type { Snapshot } from "valtio"
import { PanelListItem } from "@/components"
import { getProjectPathParts, type ProjectState } from "@/dtProjects/state/projects"

export interface ProjectListItemProps extends Omit<ChakraProps, "onContextMenu"> {
    project: Snapshot<ProjectState>
    altCount?: number
    showAltCount: boolean
    hideIfEmpty: boolean
    showSubpath: boolean
    onContextMenu?: (e: React.MouseEvent) => void
}
function ProjectListItem(props: ProjectListItemProps) {
    const {
        project,
        altCount,
        showAltCount,
        hideIfEmpty,
        showSubpath,
        onContextMenu,
        ...restProps
    } = props

    const { subpath, projectName } = getProjectPathParts(project)

    return (
        <PanelListItem
            role={"option"}
            aria-selected={project.selected}
            data-test-id={`project-item`}
            data-project-id={project.id}
            data-selected={project.selected || undefined}
            position={"relative"}
            display={
                showAltCount && hideIfEmpty && !project.selected && !altCount ? "none" : undefined
            }
            selectable
            selected={project.selected}
            asChild
            onClick={(e) => {
                project.onClick(e)
            }}
            onContextMenu={(e) => {
                if (!project.selected) project.onClick()
                onContextMenu?.(e)
            }}
            {...restProps}
        >
            <HStack justifyContent={"space-between"} minWidth={0}>
                {/* <Box margin={0} scale={1.25}>
                    <PiImage />
                </Box> */}

                <Box
                    flex={"1 1 0"}
                    minWidth={0}
                    overflow={"hidden"}
                    textOverflow={"ellipsis"}
                    whiteSpace={"normal"}
                    overflowWrap={"normal"}
                >
                    {showSubpath && subpath.length > 0 && (
                        <Box as={"span"} fontSize={"sm"}>
                            {subpath.join(" > ")}
                            {" > "}
                        </Box>
                    )}
                    {projectName}
                    {project.isMissing && " (missing)"}
                </Box>
                <Box
                    color={"fg.3"}
                    flexShrink={0}
                    fontStyle={showAltCount ? "italic" : undefined}
                    fontVariantNumeric={"tabular-nums"}
                >
                    {project.isScanning ? (
                        <Spinner size={"xs"} />
                    ) : showAltCount ? (
                        (altCount ?? 0)
                    ) : (
                        (project.image_count ?? 0)
                    )}
                </Box>
            </HStack>
        </PanelListItem>
    )
}

export default ProjectListItem
