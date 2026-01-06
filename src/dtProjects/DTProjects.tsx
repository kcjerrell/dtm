import { useEffect } from "react"
import { Panel } from "@/components"
import { LayoutRoot } from "@/metadata/Containers"
import ControlPane from "./controlPane/ControlPane"
import DetailsOverlay from "./detailsOverlay/DetailsOverlay"
import ImagesList from "./imagesList/ImagesList"
import StatusBar from "./imagesList/StatusBar"
import { SettingsPanel } from "./SettingsPanel"
import { useDTP } from "./state/context"

function ProjectData(props: ChakraProps) {
    const { ...restProps } = props

    const { uiState, projects } = useDTP()
    const uiSnap = uiState.useSnap()

    useEffect(() => {
        const showSettings = () => {
            if (projects.state.projects.length === 0) {
                uiState.showSettings(true)
            }
        }
        if (projects.hasLoaded) showSettings()
        else
            projects.onProjectsLoaded.once(() => {
                showSettings()
            })
    }, [projects, uiState])

    return (
        <LayoutRoot position={"relative"} {...restProps}>
            <ControlPane margin={2} />
            <Panel
                id={"project-content-pane"}
                position="relative"
                margin={2}
                marginLeft={0}
                p={0.5}
                // overflow={"clip"}
                flex={"1 1 auto"}
                bgColor={"bg.2"}
                alignItems={"stretch"}
                justifyContent={"flex-start"}
            >
                <StatusBar flex={"0 0 auto"} />
                <ImagesList flex={"1 1 auto"} />
                {uiSnap.isSettingsOpen && <SettingsPanel />}
            </Panel>
            <DetailsOverlay />
        </LayoutRoot>
    )
}

export default ProjectData
