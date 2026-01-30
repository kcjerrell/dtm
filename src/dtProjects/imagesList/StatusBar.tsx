import { Box, Grid, HStack } from "@chakra-ui/react"
import IconToggle from "@/components/IconToggle"
import { PiFilmStrip, PiImage } from "@/components/icons/icons"
import { useDTP } from "../state/context"
import ProjectsWidget from "./ProjectsWidget"
import SearchTextWidget from "./SearchTextWidget"

interface StatusBarProps extends ChakraProps {}

function StatusBar(props: StatusBarProps) {
    const { ...restProps } = props

    const { images } = useDTP()
    const imagesSnap = images.useSnap()

    return (
        <Grid
            paddingX={2}
            paddingY={0.5}
            bgColor={"bg.deep/50"}
            color={"fg.2"}
            templateColumns={"repeat(4, minmax(max-content, 1fr))"}
            {...restProps}
        >
            <SearchTextWidget />
            <ProjectsWidget />
            <IconToggle
                value={{
                    image: imagesSnap.imageSource.showImage,
                    video: imagesSnap.imageSource.showVideo,
                }}
                onChange={(value) => {
                    images.setShowImages(value.image ?? false)
                    images.setShowVideos(value.video ?? false)
                }}
            >
                <IconToggle.Trigger option="image">
                    <PiImage />
                </IconToggle.Trigger>
                <IconToggle.Trigger option="video">
                    <PiFilmStrip />
                </IconToggle.Trigger>
            </IconToggle>
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
