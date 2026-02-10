import { HStack, Spacer } from "@chakra-ui/react"
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
            paddingX={2}
            paddingY={0.5}
            bgColor={"bg.deep/50"}
            color={"fg.2"}
            overflow={"hidden"}
            {...restProps}
        >
            <SearchTextWidget fontSize={"sm"} />
            <FiltersWidget fontSize={"sm"} />
            <ProjectsWidget fontSize={"sm"} />
            <Spacer />
            {/* <HStack flex={"0 0 auto"} cursor={"pointer"} justifySelf={"flex-end"}> */}
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
                <IconToggle.Trigger option="image" tipText={"Show only images"}>
                    <PiImage />
                </IconToggle.Trigger>
                <IconToggle.Trigger option="video" tipText={"Show only videos"}>
                    <PiFilmStrip />
                </IconToggle.Trigger>
            </IconToggle>
            <IconButton
                variant={"inset"}
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
