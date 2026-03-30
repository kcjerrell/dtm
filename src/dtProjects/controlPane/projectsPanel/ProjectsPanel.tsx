import { Box, FormatByte, HStack } from "@chakra-ui/react"
import PanelList from "@/components/PanelList2"
import type { ProjectState } from "@/dtProjects/state/projects"
import TabContent from "@/metadata/infoPanel/TabContent"
import { useDTP } from "../../state/context"
import { useProjectsCommands } from "../useProjectsCommands"
import HiddenProjectsGroup from "./HiddenProjectsGroup"
import ProjectFolderGroup from "./ProjectFolderGroup"
import ProjectListItem from "./ProjectListItem"

interface ProjectsPanelComponentProps extends ChakraProps {}

function ProjectsPanel(props: ProjectsPanelComponentProps) {
    const { ...restProps } = props
    const { projects, images } = useDTP()
    const snap = projects.useSnap()
    const { imageSource, projectImageCounts } = images.useSnap()

    const isFiltering =
        !!imageSource?.filters?.length ||
        !!imageSource?.search ||
        imageSource?.showImage !== imageSource?.showVideo
    const showEmpty = snap.showEmptyProjects || !isFiltering

    const [showContextMenu, toolbarCommands] = useProjectsCommands()
    // const { Menu, onContextMenu } = useCommandMenu(toolbarCommands, snap.selectedProjects)

    return (
        <TabContent
            className={"tc"}
            value={"projects"}
            contentProps={{ height: "full", maxHeight: "100%", overflowY: "clip", minH: 0 }}
            height={"full"}
            {...restProps}
        >
            {/* <Menu /> */}
            <PanelList
                // bgColor={"bg.3"}
                px={0}
                role={"listbox"}
                aria-label={"projects"}
                flex={"1 1 auto"}
                className={"pl"}
                // height={"full"}
                itemsState={projects.state.projects}
                keyFn={(p) => p.path}
                commands={toolbarCommands}
                selectedItems={snap.selectedProjects as ProjectState[]}
                onSelectionChanged={(e) => {
                    projects.setSelectedProjects(e)
                }}
            >
                {snap.folders.map((folderGroup, _i, arr) => {
                    const activeProjects = folderGroup.projects.filter((p) => !p.excluded)
                    const excludedProjects = folderGroup.projects.filter((p) => p.excluded)

                    return (
                        <ProjectFolderGroup
                            key={folderGroup.watchfolder.id}
                            showLabel={arr.length > 1}
                            watchfolder={folderGroup.watchfolder}
                            onSelectFolder={(wf) => projects.selectFolderProjects(wf)}
                        >
                            {activeProjects.map((p) => (
                                <ProjectListItem
                                    marginX={2}
                                    key={p.path}
                                    project={p}
                                    altCount={projectImageCounts?.[p.id] ?? 0}
                                    onContextMenu={async (_) => {
                                        const command = await showContextMenu(
                                            projects.state.selectedProjects,
                                        )
                                        if (command) {
                                            await command()
                                        }
                                    }}
                                />
                            ))}
                            <HiddenProjectsGroup
                                projects={excludedProjects}
                                onProjectContextMenu={async (_) => {
                                    const command = await showContextMenu(
                                        projects.state.selectedProjects,
                                    )
                                    if (command) {
                                        await command()
                                    }
                                }}
                            />
                        </ProjectFolderGroup>
                    )
                })}
            </PanelList>

            <HStack color={"fg.2"} justifyContent={"space-between"} px={3} py={1} aria-label={"Projects status bar"}>
                <Box aria-label={"Total projects"}>{snap.projects.length} projects</Box>

                <Box aria-label={"Total images"}>{snap.projects.reduce((p, c) => p + (c.image_count ?? 0), 0)} images</Box>
                <Box aria-label={"Total filesize"}>
                    <FormatByte value={snap.projects.reduce((p, c) => p + (c.filesize ?? 0), 0)} />
                </Box>
            </HStack>
        </TabContent>
    )
}

export default ProjectsPanel
