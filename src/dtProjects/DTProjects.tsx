import { chakra, VStack } from "@chakra-ui/react"
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
            <VStack
                id={"project-content-pane"}
                position="relative"
                alignItems={"stretch"}
                justifyContent={"flex-start"}
                overflow={"hidden"}
                padding={0}
                gap={4}
                borderRadius={0}
            >
                <SettingsPanel />
                <ImportProgress />
                <StatusBar
                    position={"absolute"}
                    top={3}
                    left={undefined}
                    right={5}
                    width={"auto"}
                    zIndex={5}
                    margin={"0"}
                    flex={"0 0 auto"}
                    border={"1px solid {gray/50}"}
                />
                <ImagesList
                    flex={"1 1 auto"}
                    width={"full"}
                    maxWidth={"full"}
                />
                <EmptyGrid
                    position={"absolute"}
                    top={"50%"}
                    left={"50%"}
                    transform={"translate(-50%, -50%)"}
                />
            </VStack>
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

        gap: 0,
        padding: 0,

        justifyContent: "normal",
        alignItems: "stretch",

        overflow: "hidden",
        overscrollBehavior: "none none",
        zIndex: 2,
    },
})

export default DTProjects
