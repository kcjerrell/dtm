import { Box, HStack, Spinner, Text, VStack } from "@chakra-ui/react"
import MeasureGrid from "@/components/measureGrid/MeasureGrid"
import { useFfmpeg } from "@/hooks/useFfmpeg"
import type { ImageSource } from "@/types"
import type MdItem from "../state/MdItem"
import { MdVideo } from "../state/MdVideo"
import { useMetadataStore } from "../state/metadataStore2"
import DataItem from "./DataItem"
import SourceDetails from "./SourceDetails"

interface DetailsProps extends ChakraProps {
    imageSnap?: ReadonlyState<MdItem>
    expandItems?: string[]
    onItemCollapseChanged?: (key: string, collapse: "collapsed" | "expanded") => void
}

function Details(props: DetailsProps) {
    const { imageSnap, onItemCollapseChanged, expandItems, ...rest } = props
    const mdStore = useMetadataStore()
    const ffmpeg = useFfmpeg(true, () => {
        const item = imageSnap?.id && mdStore.collection.getItemById(imageSnap.id)
        if (item instanceof MdVideo) void item.loadMetadata(true)
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
            {imageSnap?.isVideo && imageSnap.storage.kind === "url" && (
                <Text>Video metadata is only available for local files.</Text>
            )}
            {imageSnap?.isVideo && imageSnap.storage.kind === "file" && (
                <>
                    <ffmpeg.FfmpegComponent
                        macMessage="FFmpeg must be downloaded to load video metadata."
                        linuxMessage="Please install FFmpeg and FFprobe with your package manager in order to load video metadata."
                    />
                    {ffmpeg.isReady && (imageSnap as MdVideo)?.metadataStatus === "pending" && (
                        <HStack justifyContent={"center"} alignItems={"center"} width={"full"}>
                            <Spinner />
                            <Text>Loading video metadata</Text>
                        </HStack>
                    )}
                </>
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
