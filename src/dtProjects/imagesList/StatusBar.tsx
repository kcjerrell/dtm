import { chakra, HStack } from "@chakra-ui/react"
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
            padding={0}
            bgColor={"bg.2"}
            boxShadow={"pane1"}
            borderRadius={"lg"}
            color={"fg.2"}
            overflow={"hidden"}
            alignItems={"center"}
            gap={0}
            {...restProps}
        >
            <Section color={"fg.3"}>
                <SearchTextWidget fontSize={"sm"} fontWeight={"medium"} />
                <FiltersWidget fontSize={"sm"} fontWeight={"medium"} />
                <ProjectsWidget fontSize={"sm"} fontWeight={"medium"} />
            </Section>
            <Section asChild>
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
            </Section>
            <Section>
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
                {/* </Section> */}
            </Section>
        </HStack>
    )
}

const Section = chakra("div", {
    base: {
        display: "flex",
        alignItems: "center",
        flexDir: "row",
        px: 1,
        borderRadius: "none",
        borderInline: "0.5px solid",
        borderInlineColor: "grayc.4",
        _first: {
            borderInlineStart: "none",
        },
        _last: {
            borderInlineEnd: "none",
        },
    },
})

export default StatusBar
