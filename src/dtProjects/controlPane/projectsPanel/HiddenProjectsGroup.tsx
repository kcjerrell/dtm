import { VStack } from "@chakra-ui/react"
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
        <VStack
            justifyContent={"inherit"}
            alignItems={"inherit"}
            gap={"inherit"}
            padding={0}
            margin={0}
            {...restProps}
        >
            <PanelListItem
                aria-label={showExcluded ? "Hide projects" : "Show hidden projects"}
                onClick={() => setShowExcluded(!showExcluded)}
                color="fg.3"
                _hover={{ color: "fg.1" }}
                alignSelf={"center"}
            >
                {showExcluded ? "Hide projects" : `Show hidden projects (${projects.length})`}
            </PanelListItem>
            {showExcluded &&
                projects.map((p) => (
                    <ProjectListItem
                        marginLeft={2}
                        key={p.path}
                        project={p}
                        onContextMenu={(e) => {
                            onProjectContextMenu(e)
                        }}
                    />
                ))}
        </VStack>
    )
}

export default HiddenProjectsGroup
