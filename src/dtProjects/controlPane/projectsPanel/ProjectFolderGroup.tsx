import { Box, HStack, Spacer, VStack } from "@chakra-ui/react"
import { useState } from "react"
import { MdBlock, MdDoNotDisturbOn } from "react-icons/md"
import { DtpService } from "@/commands"
import { IconButton, PanelListItem } from "@/components"
import { ChevronDown, ChevronForward, FiRefreshCw, PiEject } from "@/components/icons/icons"
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
    const [collapsed, setCollapsed] = useState(watchfolder.isMissing)

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
            // css={{
            //     "&:not(:first-child)": {
            //         paddingTop: "4px",
            //         borderTop: "2px solid var(--chakra-colors-grayc-0)",
            //     },
            // }}
            {...restProps}
        >
            {showLabel && (
                <HStack
                    paddingX={2}
                    marginBottom={1}
                    onMouseEnter={() => setHighlightGroup(true)}
                    onMouseLeave={() => setHighlightGroup(false)}
                    onClick={() => {
                        if (collapsed) setCollapsed(false)
                        else onSelectFolder(watchfolder)
                    }}
                    borderBottom={"1px solid {colors.grays.8/50}"}
                >
                    {/* <Button size={"xs"} variant={"ghost"}>
                        -
                    </Button> */}
                    <IconButton
                    size={"sm"}
                        onClick={(e) => {
                            e.stopPropagation()
                            setCollapsed(!collapsed)
                        }}
                    >
                        {collapsed ? <ChevronForward /> : <ChevronDown />}
                    </IconButton>
                    <Box fontSize={"sm"}>{label}</Box>
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
                !collapsed && (
                    <>
                        {activeProjects.map((p) => (
                            <ProjectListItem
                                marginLeft={2}
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
                                // cursor="pointer"
                                color="fg.3"
                                _hover={{ color: "fg.1" }}
                            >
                                <HStack>
                                    <Box as={showExcluded ? FiRefreshCw : MdBlock} />
                                    <Box>
                                        {showExcluded
                                            ? "Hide projects"
                                            : `Show hidden projects (${excludedProjects.length})`}
                                    </Box>
                                </HStack>
                            </PanelListItem>
                        )}
                        {showExcluded &&
                            excludedProjects.map((p) => (
                                <ProjectListItem
                                    marginLeft={2}
                                    key={p.path}
                                    project={p}
                                    onContextMenu={onProjectContextMenu}
                                />
                            ))}
                    </>
                )
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
