import { Box, HStack, Spacer, VStack } from "@chakra-ui/react"
import { useState } from "react"
import { MdBlock, MdDoNotDisturbOn } from "react-icons/md"
import { DtpService } from "@/commands"
import { IconButton, PanelListItem } from "@/components"
import { FiRefreshCw, PiEject } from "@/components/icons/icons"
import type { ProjectState } from "@/dtProjects/state/projects"
import type { WatchFolderState } from "@/dtProjects/state/watchFolders"
import ProjectListItem from "./ProjectListItem"

interface ProjectFolderGroupProps extends ChakraProps {
    watchfolder: WatchFolderState
    projects: readonly ProjectState[]
    altCounts?: Record<number, number>
    showLabel: boolean
    onSelectFolder: (watchfolder: WatchFolderState) => void
    onProjectContextMenu: React.MouseEventHandler
}

function ProjectFolderGroup(props: ProjectFolderGroupProps) {
    const {
        watchfolder,
        projects,
        altCounts,
        showLabel,
        children,
        onSelectFolder,
        onProjectContextMenu,
        ...restProps
    } = props

    const [highlightGroup, setHighlightGroup] = useState(false)
    const [showExcluded, setShowExcluded] = useState(false)

    const activeProjects = projects.filter((p) => !p.excluded)
    const excludedProjects = projects.filter((p) => p.excluded)

    const label = getLabel(watchfolder)

    return (
        <VStack
            justifyContent={"inherit"}
            alignItems={"inherit"}
            gap={"inherit"}
            padding={0}
            paddingBottom={2}
            margin={0}
            bgColor={highlightGroup ? "bg.2" : "unset"}
            opacity={watchfolder.isMissing ? 0.5 : "unset"}
            {...restProps}
        >
            {showLabel && (
                <HStack
                    paddingX={2}
                    onMouseEnter={() => setHighlightGroup(true)}
                    onMouseLeave={() => setHighlightGroup(false)}
                    onClick={() => onSelectFolder(watchfolder)}
                >
                    {/* <Button size={"xs"} variant={"ghost"}>
                        -
                    </Button> */}
                    <Box>{label}</Box>
                    <Spacer />
                    {watchfolder.isMissing && <MdDoNotDisturbOn />}
                    {!watchfolder.isMissing && !watchfolder.isLocked && !watchfolder.isDtData && (
                        <IconButton
                            size={"sm"}
                            tipTitle={"Eject"}
                            tipText={
                                "Stop using this folder so it can be ejected, removed, or dismounted."
                            }
                            onClick={async (e) => {
                                e.stopPropagation()
                                await DtpService.lockFolder(watchfolder.id)
                            }}
                        >
                            <PiEject />
                        </IconButton>
                    )}
                </HStack>
            )}
            {watchfolder.isLocked ? (
                <Box>Safe to remove</Box>
            ) : (
                <>
                    {activeProjects.map((p) => (
                        <ProjectListItem
                            key={p.path}
                            project={p}
                            altCount={altCounts?.[p.id] ?? 0}
                            onContextMenu={onProjectContextMenu}
                        />
                    ))}
                    {excludedProjects.length > 0 && (
                        <PanelListItem
                            // ref={toggleRef}
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
                                        : `Show excluded projects (${excludedProjects.length})`}
                                </Box>
                            </HStack>
                        </PanelListItem>
                    )}
                    {showExcluded &&
                        excludedProjects.map((p) => <ProjectListItem key={p.path} project={p} />)}
                </>
            )}
            {/* {activeProjectsSnap.map((p) => {
                    if (!showEmpty && projectImageCounts?.[p.id] === undefined) return null
                    return (
                        <ProjectListItem
                            key={p.path}
                            project={p}
                            altCount={projectImageCounts?.[p.id] ?? 0}
                        />
                    )
                })}
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
                    excludedProjectsSnap.map((p) => <ProjectListItem key={p.path} project={p} />)} */}
        </VStack>
    )
}

function getLabel(watchfolder: WatchFolderState) {
    if (watchfolder.isDtData) return "Draw Things"
    const parts = watchfolder.path.split("/")
    return parts.slice(-2).join("/")
}

export default ProjectFolderGroup
