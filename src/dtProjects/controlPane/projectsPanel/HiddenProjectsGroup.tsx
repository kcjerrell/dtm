import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { PanelListItem } from "@/components"
import { CollapseContent, CollapseRoot, CollapseTrigger } from "@/components/Collapse"
import type { ProjectState } from "@/dtProjects/state/projects"
import ProjectListItem from "./ProjectListItem"

interface HiddenProjectsGroupProps extends ChakraProps {
    projects: ProjectState[]
    onProjectContextMenu: React.MouseEventHandler
}

function HiddenProjectsGroup(props: HiddenProjectsGroupProps) {
    const { projects, onProjectContextMenu, ...restProps } = props

    const [showExcluded, setShowExcluded] = useState(false)
    const [height, setHeight] = useState(0)

    const collapseRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (projects.length === 0) setShowExcluded(false)
    }, [projects.length])

    useLayoutEffect(() => {
        if (collapseRef.current) {
            setHeight(collapseRef.current.scrollHeight)
        }
    }, [])

    if (!projects?.length) return null

    return (
        <CollapseRoot
            duration={0.2}
            display={"flex"}
            flexDirection={"column"}
            justifyContent={"inherit"}
            alignItems={"inherit"}
            gap={"inherit"}
            padding={0}
            margin={0}
            onStateChange={state => setShowExcluded(state === "open")}
            {...restProps}
        >
            <PanelListItem
                aria-label={showExcluded ? "Hide projects" : "Show hidden projects"}
                // onClick={() => setShowExcluded(!showExcluded)}
                color="fg.3"
                _hover={{ color: "fg.1" }}
                alignSelf={"center"}
                asChild
            >
                <CollapseTrigger
                    openText={"Hide Projects"}
                    collapsedText={`Show hidden projects (${projects.length})`}
                    unstyled
                />
            </PanelListItem>
            <CollapseContent
                // ref={collapseRef}
                // maxH={showExcluded ? height : 0}
                // overflow="hidden"
                // transition={showExcluded ? "max-height 0.5s" : "none"}
                justifyContent={"inherit"}
                alignItems={"inherit"}
                gap={"inherit"}
                padding={0}
                margin={0}
            >
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
            </CollapseContent>
        </CollapseRoot>
    )
}

export default HiddenProjectsGroup
