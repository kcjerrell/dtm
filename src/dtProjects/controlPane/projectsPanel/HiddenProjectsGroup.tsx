import { Collapsible, VStack } from "@chakra-ui/react"
import { useEffect, useState } from "react"
import { PanelListItem } from "@/components"
import type { ProjectState } from "@/dtProjects/state/projects"
import ProjectListItem from "./ProjectListItem"

interface HiddenProjectsGroupProps extends ChakraProps {
    projects: ProjectState[]
    onProjectContextMenu: React.MouseEventHandler
}

function HiddenProjectsGroup(props: HiddenProjectsGroupProps) {
    const { projects, onProjectContextMenu, ...restProps } = props

    const [showExcluded, setShowExcluded] = useState(false)

    useEffect(() => {
        if (projects.length === 0) setShowExcluded(false)
    }, [projects.length])

    if (!projects?.length) return null

    return (
        <Collapsible.Root open={showExcluded} onOpenChange={(e) => setShowExcluded(e.open)} asChild>
            <VStack
                justifyContent={"inherit"}
                alignItems={"inherit"}
                gap={"inherit"}
                padding={0}
                margin={0}
                {...restProps}
            >
                <Collapsible.Trigger asChild>
                    {/* <Collapsible.Indicator /> */}
                    <PanelListItem
                        aria-label={showExcluded ? "Hide projects" : "Show hidden projects"}
                        onClick={() => setShowExcluded(!showExcluded)}
                        color="fg.3"
                        _hover={{ color: "fg.1" }}
                        alignSelf={"center"}
                    >
                        {/* <HStack>
                    <Box as={showExcluded ? FiRefreshCw : MdBlock} /> */}
                        {/* <Box> */}
                        {showExcluded
                            ? "Hide projects"
                            : `Show hidden projects (${projects.length})`}
                        {/* </Box> */}
                        {/* </HStack> */}
                    </PanelListItem>
                </Collapsible.Trigger>
                <Collapsible.Content>
                    {projects.map((p) => (
                        <ProjectListItem
                            marginLeft={2}
                            key={p.path}
                            project={p}
                            onContextMenu={(e) => {
                                onProjectContextMenu(e)
                            }}
                        />
                    ))}
                </Collapsible.Content>
            </VStack>
        </Collapsible.Root>
    )
}

export default HiddenProjectsGroup
