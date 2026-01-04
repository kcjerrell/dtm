import { Box, Grid, HStack } from "@chakra-ui/react"
import ProjectsWidget from "./ProjectsWidget"
import SearchTextWidget from "./SearchTextWidget"

interface StatusBarProps extends ChakraProps {}

function StatusBar(props: StatusBarProps) {
    const { ...restProps } = props

    return (
        <Grid
            paddingX={2}
            paddingY={0.5}
            bgColor={"bg.deep/50"}
            color={"fg.2"}
            templateColumns={"repeat(3, minmax(max-content, 1fr))"}
            {...restProps}
        >
            <SearchTextWidget />
            <ProjectsWidget />
            <HStack
                gridArea={"1/3"}
                className={"group"}
                cursor={"pointer"}
                justifySelf={"flex-end"}
            >
                <Box>Date</Box>
            </HStack>
        </Grid>
    )
}

export default StatusBar
