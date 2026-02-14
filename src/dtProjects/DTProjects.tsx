import { chakra } from "@chakra-ui/react"
import { useEffect } from "react"
import { Panel } from "@/components"
import ControlPane from "./controlPane/ControlPane"
import DetailsOverlay from "./detailsOverlay/DetailsOverlay"
import ImportProgress from "./ImportProgress"
import ImagesList from "./imagesList/ImagesList"
import StatusBar from "./imagesList/StatusBar"
import { SettingsPanel } from "./settingsPanel/SettingsPanel"
import { useDTP } from "./state/context"

function DTProjects(props: ChakraProps) {
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
        <Container position={"relative"} {...restProps}>
            <ImportProgress
                open={uiSnap.importLock}
                key={`import-lock-${uiSnap.importLockCount}`}
            />
            <ControlPane />
            <Panel
                id={"project-content-pane"}
                position="relative"
                bgColor={"bg.2"}
                alignItems={"stretch"}
                justifyContent={"flex-start"}
                overflow={"hidden"}
                padding={0}
            >
                <StatusBar flex={"0 0 auto"} width={"100%"} maxWidth={"100%"} />
                <ImagesList flex={"1 1 auto"} width={"full"} maxWidth={"full"} />
                {uiSnap.isSettingsOpen && <SettingsPanel />}
            </Panel>
            <DetailsOverlay />
        </Container>
    )
}

export const Container = chakra("div", {
    base: {
        flex: "1 1 auto",

        display: "grid",
        gridTemplateColumns: "18rem 1fr",
        gridTemplateRows: "100%",
        gridTemplateAreas: "controlPane content",

        width: "100%",
        height: "100%",

        gap: 2,
        padding: 2,

        justifyContent: "normal",
        alignItems: "stretch",

        overflow: "hidden",
        overscrollBehavior: "none none",
    },
})

export default DTProjects
