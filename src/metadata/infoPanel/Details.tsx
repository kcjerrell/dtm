import { Box, VStack } from "@chakra-ui/react"
import MeasureGrid from "@/components/measureGrid/MeasureGrid"
import { useFfmpeg } from "@/hooks/useFfmpeg"
import type { ImageSource } from "@/types"
import type MediaItem from "../state/MediaItem"
import type { VideoItem } from "../state/VideoItem"
import DataItem from "./DataItem"
import SourceDetails from "./SourceDetails"

interface DetailsProps extends ChakraProps {
    imageSnap?: ReadonlyState<MediaItem>
    expandItems?: string[]
    onItemCollapseChanged?: (key: string, collapse: "collapsed" | "expanded") => void
}

function Details(props: DetailsProps) {
    const { imageSnap, onItemCollapseChanged, expandItems, ...rest } = props
    const ffmpeg = useFfmpeg(true, () => {
        if (!imageSnap?.isVideo) return
        ;(imageSnap as VideoItem).loadMetadata(true)
    })

    const exif = imageSnap?.metadata ?? {}
    const groups = groupItems(exif)

    const imageSource = imageSnap?.source ?? ({} as ImageSource)

    return (
        <VStack
            {...rest}
            bgColor={"bg.2"}
            fontSize={"xs"}
            alignItems={"start"}
            width={"100%"}
            minWidth={0}
        >
            <SourceDetails imageSource={imageSource} />
            {imageSnap?.isVideo && (
                <ffmpeg.FfmpegComponent>
                    FFMPEG must be downloaded to load video metadata.
                </ffmpeg.FfmpegComponent>
            )}
            {groups.map(({ name, items }) => {
                return (
                    <MeasureGrid
                        key={name}
                        columns={2}
                        maxItemLines={6}
                        fontSize={"xs"}
                        bgColor={"bg.1"}
                        gap={0.5}
                        width={"100%"}
                        padding={1}
                    >
                        <Box gridColumn={"1 / span 2"} textAlign={"center"}>
                            {name}
                        </Box>
                        {items.map(({ key, value }) => {
                            return (
                                <DataItem
                                    key={key}
                                    label={key}
                                    data={value}
                                    initialCollapse={
                                        expandItems?.includes(`${name}_${key}`)
                                            ? "expanded"
                                            : "collapsed"
                                    }
                                    onCollapseChange={(value) => {
                                        const expKey = `${name}_${key}`
                                        onItemCollapseChanged?.(expKey, value)
                                    }}
                                />
                            )
                        })}
                    </MeasureGrid>
                )
            })}
        </VStack>
    )
}

type MetaDataGroup = {
    name: string
    items: { key: string; value: unknown }[]
}

function groupItems(root: Record<string, unknown>) {
    const groups: MetaDataGroup[] = []

    for (const [k, v] of Object.entries(root)) {
        const group: MetaDataGroup = { name: k, items: [] }

        for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
            group.items.push({ key: k2, value: v2 })
        }

        groups.push(group)
    }

    return groups
}

export default Details
