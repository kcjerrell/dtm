import { SimpleGrid } from "@chakra-ui/react"
import type { MediaItemSource } from "../state/MediaItem"
import DataItem from "./DataItem"

function SourceDetails(props: { imageSource: MediaItemSource }) {
    const imageSource = props.imageSource
    const source = getSourceDescription(props.imageSource)
    return (
        <SimpleGrid
            as={"dl"}
            columns={2}
            fontSize={"xs"}
            bgColor={"bg.1"}
            gap={0.5}
            width={"100%"}
            padding={1}
            alignItems={"flex-start"}
        >
            <DataItem gridColumn={1} gridRow={1} label={"Source"} data={source} />
            <DataItem
                gridColumn={2}
                gridRow={1}
                label={"Data type"}
                data={imageSource.type}
                wordBreak={"break-word"}
            />
            {/* <HStack gap={0}>
				<Tooltip tip={"Save a copy"}>
					<IconButton size={"sm"} color={"fg.3"} variant={"ghost"}>
						<FiSave />
					</IconButton>
				</Tooltip>
				{imageSource.file && (
					<Tooltip tip={"Show in finder"}>
						<IconButton size={"sm"} color={"fg.3"} variant={"ghost"}>
							<FiFolder />
						</IconButton>
					</Tooltip>
				)}
				{imageSource.url && (
					<Tooltip tip={"Open in browser"}>
						<IconButton size={"sm"} color={"fg.3"} variant={"ghost"}>
							<TbBrowser />
						</IconButton>
					</Tooltip>
				)}
			</HStack> */}
            {(imageSource.file || imageSource.url || imageSource.projectFile) && (
                <DataItem
                    gridColumn={"1 / span 2"}
                    gridRow={2}
                    label={"Location"}
                    data={imageSource.file || imageSource.url || imageSource.projectFile}
                    wordBreak={"break-all"}
                    overflow={"clip"}
                />
            )}
            {imageSource.projectFile && (
                <>
                    {imageSource.tensorId && (
                        <DataItem
                            gridColumn={1}
                            gridRow={3}
                            label={"Tensor ID"}
                            data={imageSource.tensorId}
                        />
                    )}
                    {imageSource.nodeId && (
                        <DataItem
                            gridColumn={2}
                            gridRow={3}
                            label={"Node ID"}
                            data={imageSource.nodeId}
                        />
                    )}
                </>
            )}
            <DataItem label={"Source"} gridColumn={"1 / span 2"} data={imageSource} />
        </SimpleGrid>
    )
}

export default SourceDetails

const imageUtis = [
    "public.png",
    "public.jpeg",
    "public.tiff",
    "public.bmp",
    "public.gif",
    "public.webp",
]

function getSourceDescription(imageSource: MediaItemSource) {
    let type = "Unknown"

    if (imageSource.file) type = "File"
    if (imageSource.url) type = "URL"
    if (imageSource.image || imageSource.projectFile) type = "Image"
    if (imageSource.uti && imageUtis.includes(imageSource.uti)) type = "Image"

    switch (imageSource.loadedFrom) {
        case "clipboard":
            return `${type} from clipboard`
        case "drop":
            return `${type} drop`
        case "open":
            return "Opened from file"
        case "project":
            return "Opened from Draw Things project"
    }
}
