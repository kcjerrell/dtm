import {
    Box,
    chakra,
    createSlotRecipeContext,
    defineSlotRecipe,
    type HTMLChakraProps,
    type RecipeVariantProps,
    Spinner,
} from "@chakra-ui/react"
import type { ImageExtra } from "@/commands"
import FrameCountIndicator from "@/components/FrameCountIndicator"
import Video from "@/components/video/Video"
import { VideoImage } from "@/components/video/VideoImage"

export interface GridImageProps extends Omit<ChakraProps, "onPointerEnter" | "onPointerLeave"> {
    showDetailsOverlay: (index: number) => void
    onPointerEnter?: (index: number) => void
    onPointerLeave?: (index: number) => void
    hoveredIndex?: number
    selectedIds?: Set<number>
    item: ImageExtra | null | undefined
    index: number
    spinnerIds?: Set<number>
}

const gridImageRecipe = defineSlotRecipe({
    slots: ["root", "image", "video", "spinner", "icon", "wrapper"],
    base: {
        root: {
            position: "relative",
            bgColor: "grays.7",
            outlineOffset: "2px",
            transformOrigin: "center center",
            border: "1px solid transparent",
        },
        image: {
            width: "100%",
            height: "100%",
            objectFit: "cover",
            backgroundSize: "cover",
            backgroundPosition: "center",
        },
        wrapper: {
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "opacity 0.2s",
        },
        video: {
            width: "100%",
            height: "100%",
            objectFit: "cover",
        },
        spinner: {
            position: "absolute",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            top: "35%",
            left: "35%",
            width: "30%",
            height: "30%",
            color: "grays.13",
            bgColor: "#000000aa",
            padding: 1,
            borderRadius: "50%",
            fontWeight: "bolder",
            // "--spinner-track-color": "colors.grays.13",
        },
        icon: {
            bgColor: "grays.3/70",
            position: "absolute",
            bottom: 1,
            left: 1,
            width: "1.5rem",
            color: "grays.14",
            boxShadow: "0 0 2px rgba(0,0,0,1)",
            borderRadius: 1,
        },
    },
    variants: {
        selected: {
            true: {
                root: {
                    border: "0px solid",
                    borderColor: "grays.13",
                    outline: "2px solid {colors.grays.15/70}",
                    outlineOffset: "-2px",
                    margin: "-1px",
                    zIndex: 1,
                },
                wrapper: {
                    opacity: 1,
                },
            },
            false: {
                root: {},
                wrapper: {
                    opacity: 0.4,
                },
            },
        },
    },
})

const { withProvider, withContext } = createSlotRecipeContext({ recipe: gridImageRecipe })

interface GridImageRootProps
    extends HTMLChakraProps<"div", RecipeVariantProps<typeof gridImageRecipe>> {}
const GridImageRoot = withProvider<HTMLDivElement, GridImageRootProps>("div", "root")

interface GridImageVideoProps
    extends HTMLChakraProps<"div", RecipeVariantProps<typeof gridImageRecipe>> {}
const GridImageVideo = withContext<HTMLDivElement, GridImageVideoProps>("div", "video")

interface GridImageImageProps
    extends HTMLChakraProps<"img", RecipeVariantProps<typeof gridImageRecipe>> {}
const GridImageImage = withContext<HTMLImageElement, GridImageImageProps>("img", "image")

interface GridImageWrapperProps
    extends HTMLChakraProps<"div", RecipeVariantProps<typeof gridImageRecipe>> {}
const GridImageWrapper = withContext<HTMLDivElement, GridImageWrapperProps>("div", "wrapper")

interface GridImageSpinnerProps
    extends HTMLChakraProps<"div", RecipeVariantProps<typeof gridImageRecipe>> {}
const GridImageSpinner = withContext<HTMLDivElement, GridImageSpinnerProps>("div", "spinner")

interface GridImageIconProps
    extends HTMLChakraProps<"div", RecipeVariantProps<typeof gridImageRecipe>> {}
const GridImageIcon = withContext<HTMLDivElement, GridImageIconProps>("div", "icon")

function GridImage(props: GridImageProps) {
    const {
        item,
        showDetailsOverlay,
        index,
        hoveredIndex,
        onPointerEnter,
        onPointerLeave,
        onContextMenu,
        selectedIds,
        spinnerIds,
        ...rest
    } = props

    if (!item) return <Box />

    const previewId = `${item?.project_id}/${item?.preview_id}`
    const thumbUrl = item.is_ready ? `dtm://dtproject/thumbhalf/${previewId}` : null

    const isVideo = (item.num_frames ?? 0) > 0
    const showVideo = isVideo && hoveredIndex === index

    const isSelected = selectedIds?.has(item.id)
    const showSpinner = spinnerIds?.has(item.id)

    return (
        <GridImageRoot
            role={"gridcell"}
            data-testid="image-item"
            data-project-id={item.project_id}
            data-image-id={item.id}
            onPointerEnter={() => onPointerEnter?.(index)}
            onPointerLeave={() => onPointerLeave?.(index)}
            onClick={() => showDetailsOverlay(index)}
            onContextMenu={onContextMenu}
            selected={isSelected}
            // bgColor={thumbUrl ? undefined : "transparent"}
            margin={thumbUrl ? undefined : 4}
            borderRadius={thumbUrl ? undefined : "lg"}
            {...rest}
        >
            {showVideo ? (
                <Video image={item} half autoStart>
                    <GridImageVideo asChild>
                        <VideoImage fit={"cover"} />
                    </GridImageVideo>
                </Video>
            ) : (
                <GridImageWrapper key={thumbUrl}>
                    {thumbUrl ? (
                        <GridImageImage key={thumbUrl} src={thumbUrl} alt={item?.prompt} />
                    ) : (
                        <div
                            style={{
                                width: "70%",
                                // border: "1px solid #0000ff00",
                                aspectRatio: "1",
                                backgroundColor: "var(--chakra-colors-grays-8)",
                                WebkitMaskImage: "url(/img_not_available.svg)",
                                WebkitMaskSize: "contain",
                                WebkitMaskRepeat: "no-repeat",
                                WebkitMaskPosition: "center",
                                maskImage: "url(/img_not_available.svg)",
                                maskSize: "contain",
                                maskRepeat: "no-repeat",
                                maskPosition: "center",
                            }}
                        />
                    )}
                </GridImageWrapper>
            )}
            {isVideo && (
                <GridImageIcon asChild>
                    <FrameCountIndicator count={item.num_frames ?? 0} />
                </GridImageIcon>
            )}
            {showSpinner && (
                <GridImageSpinner>
                    <Spinner size={"lg"} />
                </GridImageSpinner>
            )}
        </GridImageRoot>
    )
}

const Base = chakra("div", {
    base: {
        "& div": {
            opacity: 1,
            transition: "opacity 0.2s ease",
        },
    },
    variants: {
        selected: {
            true: {
                "& div": {
                    opacity: 1,
                },
            },
            false: {
                "& div": {
                    opacity: 0.4,
                },
                // boxShadow: "inset 0 0 24px -6px #000000",
                // borderColor: "grays.5",
                // outline: "1px solid {colors.grays.5}",
                // outlineOffset: "-1px",
            },
        },
    },
})

export default GridImage
