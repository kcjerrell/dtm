import { chakra } from "@chakra-ui/react/styled-system"
import urls from "@/commands/urls"
import PoseImage from "@/components/Pose"
import { LuLayers } from "react-icons/lu"
import { Box } from "@chakra-ui/react"

const _thumbnailSize = "60px"

interface ThumbnailProps extends ChakraProps {
    projectId: number
    tensorId: string
    maskId?: string
    weight?: number
}
function TensorThumbnail(props: ThumbnailProps) {
    const { projectId, tensorId, maskId, weight, ...restProps } = props

    if (tensorId?.startsWith("pose")) {
        return (
            <ThumbnailBase {...restProps} asChild>
                <PoseImage projectId={projectId} tensorId={tensorId} />
            </ThumbnailBase>
        )
    }

    const src = urls.tensor(projectId, tensorId, { size: 100 })

    if (weight !== undefined) {
        // if (weight === 0) return null
        return (
            <ThumbnailBase position={"relative"} {...restProps}>
                <ThumbnailImage src={src} />
                <Mask projectId={projectId} maskId={maskId} />
                <Box
                    position={"absolute"}
                    bottom={"0%"}
                    right={"50%"}
                    transform={"translateX(50%)"}
                    // bgColor={"grays.1"}
                    fontSize={"xs"}
                    fontWeight={"semibold"}
                    padding={1}
                    borderRadius={"lg"}
                    color={"grays.12"}
                    textShadow={"0px 0px 2px #000000"}
                    zIndex={3}
                >
                    {weight * 100}%
                </Box>
            </ThumbnailBase>
        )
    }

    return (
        <ThumbnailBase position={"relative"} {...restProps}>
            <ThumbnailImage src={src} />
            <Mask projectId={projectId} maskId={maskId} />
        </ThumbnailBase>
    )
}

export function CanvasCombinedButton(props: ChakraProps) {
    return (
        <ThumbnailBase
            width={"40px"}
            height={"40px"}
            bgColor={"grays.3"}
            color={"grays.10"}
            transform={"translateX(15px)"}
            _hover={{
                transform: "scale(1.0) translateX(0px)",
                bgColor: "grays.2",
                color: "grays.11",
            }}
            borderRightRadius={"none"}
            marginY={"auto"}
            zIndex={0}
            asChild
            {...props}
        >
            <LuLayers />
        </ThumbnailBase>
    )
}

interface MaskProps extends ChakraProps {
    projectId?: number
    maskId?: string
}

function Mask(props: MaskProps) {
    const { projectId, maskId, ...rest } = props
    if (!projectId || !maskId) return null
    return (
        <Box
            maskImage={`url(${urls.tensor(projectId, maskId, { size: 100 })})`}
            maskMode="luminance"
            maskSize="contain"
            backgroundColor="grays.12"
            position={"absolute"}
            inset={0}
            pointerEvents={"none"}
            zIndex={2}
            {...rest}
        />
    )
}

const ThumbnailBase = chakra("div", {
    base: {
        width: _thumbnailSize,
        height: _thumbnailSize,
        bgColor: "bg.1",
        border: "1px solid gray",
        transformOrigin: "center bottom",
        overflow: "clip",
        boxShadow:
            "0px 2px 14px -5px #00000044, 0px 1px 8px -3px #00000044, 1px 0px 3px 0px #00000044",
        zIndex: 1,
        _first: {
            borderInlineStartRadius: "lg",
        },
        _last: {
            borderInlineEndRadius: "lg",
        },
        _hover: {
            transform: "scale(1.1)",
            zIndex: 2,
            transition: "all 0.05s ease",
            boxShadow:
                "0px 2px 14px -2px #00000055, 0px 1px 8px -2px #00000055, 1px 0px 3px 0px #00000055",
        },
        transition: "all 0.2s ease",
    },
})

const ThumbnailImage = chakra("img", {
    base: {
        objectFit: "cover",
    },
})

export default TensorThumbnail
