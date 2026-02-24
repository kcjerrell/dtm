import { Box, FormatByte, HStack } from "@chakra-ui/react"
import { useEffect, useRef, useState } from "react"
import { computed } from "valtio-reactive"
import PanelList from "@/components/PanelList"
import TabContent from "@/metadata/infoPanel/TabContent"
import { useDTP } from "../../state/context"
import { useProjectsCommands } from "../useProjectsCommands"
import ProjectFolderGroup from "./ProjectFolderGroup"
import ProjectListItem from "./ProjectListItem"

interface ProjectsPanelComponentProps extends ChakraProps {}

function ProjectsPanel(props: ProjectsPanelComponentProps) {
    const { ...restProps } = props
    const { projects, images } = useDTP()
    const snap = projects.useSnap()
    const { imageSource, projectImageCounts } = images.useSnap()
    const [showExcluded, setShowExcluded] = useState(false)
    const toggleRef = useRef<HTMLDivElement>(null)

    const showFolders = true

    const groups = computed({
        activeProjects: () => projects.state.projects.filter((p) => !p.excluded),
        excludedProjects: () => projects.state.projects.filter((p) => p.excluded),
        allProjects: () =>
            projects.state.projects.toSorted(
                (a, b) => (a.excluded ? 1 : -1) - (b.excluded ? 1 : -1),
            ),
    })

    const isFiltering =
        !!imageSource?.filters?.length ||
        !!imageSource?.search ||
        imageSource?.showImage !== imageSource?.showVideo
    const showEmpty = snap.showEmptyProjects || !isFiltering

    useEffect(() => {
        if (showExcluded && toggleRef.current) {
            setTimeout(() => {
                toggleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            }, 100)
        }
    }, [showExcluded])

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
                role={"listbox"}
                aria-label={"projects"}
                flex={"1 1 auto"}
                className={"pl"}
                // height={"full"}
                itemsState={showExcluded ? groups.allProjects : groups.activeProjects}
                keyFn={(p) => p.path}
                commands={toolbarCommands}
                onSelectionChanged={(e) => {
                    projects.setSelectedProjects(e)
                }}
            >
                {showFolders &&
                    Object.entries(snap.folders).map(([id, folderGroup], _, arr) => (
                        <ProjectFolderGroup
                            key={id}
                            showLabel={arr.length > 1}
                            watchfolder={folderGroup.watchfolder}
                            onSelectFolder={(wf) => projects.selectFolderProjects(wf)}
                        >
                            {folderGroup.projects.map((p) => (
                                <ProjectListItem
                                    key={p.path}
                                    project={p}
                                    altCount={projectImageCounts?.[p.id] ?? 0}
                                />
                            ))}
                        </ProjectFolderGroup>
                    ))}
            </PanelList>

            <HStack color={"fg.2"} justifyContent={"space-between"} px={3} py={1}>
                <Box>{groups.activeProjects.length} projects</Box>

                <Box>
                    {groups.activeProjects.reduce((p, c) => p + (c.image_count ?? 0), 0)} images
                </Box>
                <Box>
                    <FormatByte
                        value={groups.activeProjects.reduce((p, c) => p + (c.filesize ?? 0), 0)}
                    />
                </Box>
            </HStack>
        </TabContent>
    )
}

export default ProjectsPanel
