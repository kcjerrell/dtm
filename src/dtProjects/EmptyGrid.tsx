import { chakra, Text } from "@chakra-ui/react"
import { LuPackageSearch } from "react-icons/lu"
import { Panel } from "@/components"
import { plural } from "@/utils/helpers"
import { useDTP } from "./state/context"

interface EmptyGridComponentProps extends ChakraProps {}

function EmptyGrid(props: EmptyGridComponentProps) {
    const { ...restProps } = props

    const { images } = useDTP()
    const snap = images.useSnap()

    if (snap.selectedProjectsCount || snap.totalImageCount === undefined) return null

    const projectsSelected = snap.imageSource?.projectIds?.length ?? 0
    const isVideo = !snap.imageSource?.showImage && snap.imageSource?.showVideo
    const isSearching = !!snap.imageSource?.search
    const isFiltering = !!snap.imageSource?.filters?.length

    const messageParts = [
        "No",
        isSearching || isFiltering ? "matching" : null,
        isVideo ? "videos" : "images",
        "found",
        projectsSelected
            ? `in ${plural(projectsSelected, "this", "these")} project${plural(projectsSelected)}`
            : null,
    ].filter(Boolean)
    const message = `${messageParts.join(" ")}.`

    let suggestion = "Try adding some folders in the Settings panel."

    if (isSearching || isFiltering || projectsSelected || isVideo) {
        const suggest = []
        if (isSearching) suggest.push("clearing your search terms")
        if (isFiltering) suggest.push("clearing your search filters")
        if (projectsSelected) suggest.push("changing your project selection")
        if (isVideo) suggest.push("turning off the video filter")

        if (suggest.length > 1) {
            const last = suggest.pop()
            suggest[suggest.length - 1] += ` or ${last}`
        }

        suggestion = `Try ${suggest.join(", ")}.`
    }

    return (
        <Panel
            width={"auto"}
            bgColor={"bg.1"}
            color={"fg.2"}
            padding={4}
            borderRadius={"xl"}
            {...restProps}
        >
            <NoImagesIcon
                width={"8rem"}
                height={"8rem"}
                margin={"1rem"}
                strokeWidth={1}
                alignSelf={"center"}
                color={"fg.2"}
            />
            <Text margin={"1rem"}>
                {message} {suggestion}
            </Text>
        </Panel>
    )
}

export default EmptyGrid

const NoImagesIcon = chakra(LuPackageSearch, {})
