import { Box, HStack, Spacer } from "@chakra-ui/react"
import { IconButton } from "@/components"
import IconToggle from "@/components/IconToggle"
import { PiFilmStrip, PiImage, TbSortAscending2, TbSortDescending2 } from "@/components/icons/icons"
import { useDTP } from "../state/context"
import FiltersWidget from "./FiltersWidget"
import ProjectsWidget from "./ProjectsWidget"
import SearchTextWidget from "./SearchTextWidget"

interface StatusBarProps extends ChakraProps {}

function StatusBar(props: StatusBarProps) {
    const { ...restProps } = props

    const { images } = useDTP()
    const imagesSnap = images.useSnap()

    return (
        <HStack
            justifyContent={"flex-start"}
            paddingX={4}
            paddingY={1}
            bgColor={"bg.2"}
            boxShadow={"pane1"}
            borderRadius={"lg"}
            color={"fg.2"}
            overflow={"hidden"}
            alignItems={"center"}
            {...restProps}
        >
            <SearchTextWidget fontSize={"sm"} fontWeight={"semibold"} />
            <FiltersWidget fontSize={"sm"} fontWeight={"semibold"} />
            <ProjectsWidget fontSize={"sm"} fontWeight={"semibold"} />
            {/* <Spacer /> */}
            {/* <HStack flex={"0 0 auto"} cursor={"pointer"} justifySelf={"flex-end"}> */}
            <Box bgColor={"fg.3"} width={"1px"} height={"2rem"} opacity={"50%"} />
            <IconToggle
                value={{
                    image: imagesSnap.imageSource.showImage,
                    video: imagesSnap.imageSource.showVideo,
                }}
                onChange={(value) => {
                    images.setShowImages(value.image ?? false)
                    images.setShowVideos(value.video ?? false)
                }}
                mode="zeroOrOne"
            >
                <IconToggle.Trigger
                    size={"sm"}
                    variant={"ghost"}
                    option="image"
                    tipText={"Show only images"}
                >
                    <PiImage />
                </IconToggle.Trigger>
                <IconToggle.Trigger
                    size={"sm"}
                    variant={"ghost"}
                    option="video"
                    tipText={"Show only videos"}
                >
                    <PiFilmStrip />
                </IconToggle.Trigger>
            </IconToggle>
            <Box bgColor={"fg.3"} width={"1px"} height={"2rem"} opacity={"50%"} />

            <IconButton
                variant={"ghost"}
                size={"sm"}
                onClick={() => images.toggleSortDirection()}
                tip={`Sort by date (${imagesSnap.imageSource.direction === "asc" ? "oldest" : "newest"})`}
            >
                {imagesSnap.imageSource.direction === "asc" ? (
                    <TbSortDescending2 />
                ) : (
                    <TbSortAscending2 />
                )}
            </IconButton>
            {/* </HStack> */}
        </HStack>
    )
}

export default StatusBar
