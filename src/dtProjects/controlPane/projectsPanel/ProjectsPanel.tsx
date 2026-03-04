import { Box, FormatByte, HStack } from "@chakra-ui/react"
import PanelList from "@/components/PanelList2"
import TabContent from "@/metadata/infoPanel/TabContent"
import { useDTP } from "../../state/context"
import { useProjectsCommands } from "../useProjectsCommands"
import ProjectFolderGroup from "./ProjectFolderGroup"

interface ProjectsPanelComponentProps extends ChakraProps {}

function ProjectsPanel(props: ProjectsPanelComponentProps) {
    const { ...restProps } = props
    const { projects, images } = useDTP()
    const snap = projects.useSnap()
    const { imageSource, projectImageCounts } = images.useSnap()

    const showFolders = true

    const isFiltering =
        !!imageSource?.filters?.length ||
        !!imageSource?.search ||
        imageSource?.showImage !== imageSource?.showVideo
    const showEmpty = snap.showEmptyProjects || !isFiltering

    const toolbarCommands = useProjectsCommands()

    console.log("render")

    return (
        <TabContent
            className={"tc"}
            value={"projects"}
            contentProps={{ height: "full", maxHeight: "100%", overflowY: "clip" }}
            height={"full"}
            {...restProps}
        >
            <PanelList
                // bgColor={"bg.3"}
                px={2}
                role={"listbox"}
                aria-label={"projects"}
                flex={"1 1 auto"}
                className={"pl"}
                // height={"full"}
                itemsState={projects.state.projects}
                keyFn={(p) => p.path}
                commands={toolbarCommands}
                selectedItems={snap.selectedProjects}
                onSelectionChanged={(e) => {
                    projects.setSelectedProjects(e)
                }}
            >
                {showFolders &&
                    snap.folders.map((folderGroup, i, arr) => (
                        <ProjectFolderGroup
                            key={i}
                            showLabel={arr.length > 1}
                            watchfolder={folderGroup.watchfolder}
                            altCounts={projectImageCounts}
                            projects={folderGroup.projects}
                            onSelectFolder={(wf) => projects.selectFolderProjects(wf)}
                        />
                    ))}
            </PanelList>

            <HStack color={"fg.2"} justifyContent={"space-between"} px={3} py={1}>
                <Box>{snap.projects.length} projects</Box>

                <Box>{snap.projects.reduce((p, c) => p + (c.image_count ?? 0), 0)} images</Box>
                <Box>
                    <FormatByte value={snap.projects.reduce((p, c) => p + (c.filesize ?? 0), 0)} />
                </Box>
            </HStack>
        </TabContent>
    )
}

export default ProjectsPanel
