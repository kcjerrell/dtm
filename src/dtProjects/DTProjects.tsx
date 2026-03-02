import { chakra } from "@chakra-ui/react"
import { Panel } from "@/components"
import { useSidebarStyle } from "@/components/sidebar/useSidebarStyle"
import ControlPane from "./controlPane/ControlPane"
import DetailsOverlay from "./detailsOverlay/DetailsOverlay"
import EmptyGrid from "./EmptyGrid"
import ImportProgress from "./ImportProgress"
import ImagesList from "./imagesList/ImagesList"
import StatusBar from "./imagesList/StatusBar"
import { SettingsPanel } from "./settingsPanel/SettingsPanel"

function DTProjects(props: ChakraProps) {
    const { ...restProps } = props

    useSidebarStyle("attached")

    return (
        <Container position={"relative"} {...restProps}>
            <ControlPane />
            <Panel
                id={"project-content-pane"}
                position="relative"
                alignItems={"stretch"}
                justifyContent={"flex-start"}
                overflow={"hidden"}
                padding={0}
            >
                <SettingsPanel />
                <ImportProgress />
                <StatusBar flex={"0 0 auto"} width={"100%"} maxWidth={"100%"} />
                <ImagesList flex={"1 1 auto"} width={"full"} maxWidth={"full"} />
                <EmptyGrid
                    position={"absolute"}
                    top={"50%"}
                    left={"50%"}
                    transform={"translate(-50%, -50%)"}
                />
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
