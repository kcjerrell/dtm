import { chakra, HStack } from "@chakra-ui/react"
import { LuSlash } from "react-icons/lu"
import { MdOutlineSdStorage } from "react-icons/md"
import { IconButton } from "@/components"
import IconToggle from "@/components/IconToggle"
import { PiFilmStrip, PiImage, TbSortAscending2, TbSortDescending2 } from "@/components/icons/icons"
import { useDTP } from "../state/context"
import FiltersWidget from "./FiltersWidget"
import ProjectsWidget from "./ProjectsWidget"
import SearchTextWidget from "./SearchTextWidget"

interface ToolbarProps extends ChakraProps {}

function Toolbar(props: ToolbarProps) {
    const { ...restProps } = props

    const { images, watchFolders } = useDTP()
    const imagesSnap = images.useSnap()
    const wfSnap = watchFolders.useSnap()

    const showDisconnected = imagesSnap.imageSource.showDisconnected

    return (
        <HStack
            aria-label={"Image grid controls"}
            role={"toolbar"}
            justifyContent={"flex-start"}
            padding={0}
            bgColor={"bg.2"}
            boxShadow={"pane1"}
            borderRadius={"lg"}
            color={"fg.2"}
            overflow={"hidden"}
            alignItems={"center"}
            gap={0}
            height={"auto"}
            {...restProps}
        >
            <Section color={"fg.3"}>
                <SearchTextWidget fontSize={"sm"} fontWeight={"medium"} />
                <FiltersWidget fontSize={"sm"} fontWeight={"medium"} />
                <ProjectsWidget fontSize={"sm"} fontWeight={"medium"} />
            </Section>
            <Section>
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
                {wfSnap.hasExternalFolders && (
                    <IconButton
                        variant={"simple"}
                        size={"sm"}
                        display={"grid"}
                        css={{ "& svg": { gridColumn: 1, gridRow: 1 } }}
                        onClick={() => images.toggleShowDisconnected()}
                        opacity={showDisconnected ? 1 : 0.5}
                        tip={`Include images from disconnected folders`}
                    >
                        <MdOutlineSdStorage />
                        {!showDisconnected && <LuSlash />}
                    </IconButton>
                )}
                <IconButton
                    variant={"simple"}
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
        _notLast: {
            _after: {
                content: "''",
                width: "1px",
                marginLeft: 2,
                height: 5,
                backgroundColor: "grayc.10",
            },
        },
        _empty: {
            display: "none",
        },
        // borderRadius: "none",
        // borderInline: "1px solid",
        // borderInlineColor: "grayc.12",
        // _first: {
        //     borderInlineStart: "none",
        // },
        // _last: {
        //     borderInlineEnd: "none",
        // },
    },
})

export default Toolbar
