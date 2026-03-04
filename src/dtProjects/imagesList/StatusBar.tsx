import { Box, HStack, Spacer } from "@chakra-ui/react"
import { IconButton } from "@/components"
import IconToggle from "@/components/IconToggle"
import { PiFilmStrip, PiImage, TbSortAscending2, TbSortDescending2 } from "@/components/icons/icons"
import { useDTP } from "../state/context"
import FiltersWidget from "./FiltersWidget"
import ProjectsWidget from "./ProjectsWidget"
import SearchTextWidget from "./SearchTextWidget"

interface StatusBarProps extends ChakraProps {}

const divider = {
    content: '""',
    width: "1px",
    height: "1.5rem",
    bgColor: "fg.3",
    opacity: "50%",
    margin: "4px",
}

function StatusBar(props: StatusBarProps) {
    const { ...restProps } = props

    const { images } = useDTP()
    const imagesSnap = images.useSnap()

    return (
        <HStack
            justifyContent={"flex-start"}
            paddingX={4}
            paddingY={0}
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
                css={{
                    "&:not(:nth-of-type(1))": {
                        _before: divider,
                    },
                }}
                _after={divider}
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
