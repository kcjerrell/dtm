import { Box, HStack } from "@chakra-ui/react"
import { FiX } from "@/components/icons"
import { IconButton } from "@/components"
import { useDTP } from "../state/context"

interface ProjectsWidgetProps extends ChakraProps {}

function ProjectsWidget(props: ProjectsWidgetProps) {
    const { ...restProps } = props

    const { images } = useDTP()
    const snap = images.useSnap()

    const projects = snap.imageSource.projectIds?.length

    if (!projects) return null

    return (
        <HStack
            className={"group"}
            cursor={"pointer"}
            // gridArea={"1/2"}
            // justifySelf={"center"}
            {...restProps}
        >
            <Box>{projects} projects selected</Box>
            <IconButton
                size="min"
                onClick={() => {
                    images.setSelectedProjects([])
                }}
                visibility="hidden"
                _groupHover={{ visibility: "visible" }}
            >
                <FiX />
            </IconButton>
        </HStack>
    )
}

export default ProjectsWidget
