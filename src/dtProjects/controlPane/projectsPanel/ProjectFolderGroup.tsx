import { Box, Button, HStack, Spacer, VStack } from "@chakra-ui/react"
import { useState } from "react"
import { MdDoNotDisturbOn } from "react-icons/md"
import { DtpService } from "@/commands"
import { IconButton } from "@/components"
import { PiEject } from "@/components/icons/icons"
import type { WatchFolderState } from "@/dtProjects/state/watchFolders"

interface ProjectFolderGroupProps extends ChakraProps {
    watchfolder: WatchFolderState
    showLabel: boolean
    onSelectFolder: (watchfolder: WatchFolderState) => void
}

function ProjectFolderGroup(props: ProjectFolderGroupProps) {
    const { watchfolder, showLabel, children, onSelectFolder, ...restProps } = props

    const [highlightGroup, setHighlightGroup] = useState(false)

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
                    <Button size={"xs"} variant={"ghost"}>
                        -
                    </Button>
                    <Box>{label}</Box>
                    <Spacer />
                    {watchfolder.isMissing && <MdDoNotDisturbOn />}
                    {!watchfolder.isMissing && !watchfolder.isLocked && (
                        <IconButton
                            size={"sm"}
                            tipTitle={"Eject?"}
                            tipText={
                                "Stops tracking the folder so it can be ejected/removed. (Note: It doesn't actually dismount the drive)"
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
            {watchfolder.isLocked ? <Box>Safe to remove</Box> : children}
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
