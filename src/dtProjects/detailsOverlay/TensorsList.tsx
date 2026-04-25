import { Box, chakra, Spacer, Text, VStack } from "@chakra-ui/react"
import { motion } from "motion/react"
import { type ComponentProps, useCallback } from "react"
import type { DTImageFull, ImageExtra, TensorHistoryExtra } from "@/commands"
import { MotionBox, Tooltip } from "@/components"
import { useDTP } from "../state/context"
import TensorThumbnail, { CanvasCombinedButton } from "./TensorThumbnail"

interface TensorsListComponentProps extends ComponentProps<typeof Container> {
    item?: ImageExtra
    details?: MaybeReadonly<DTImageFull>
    candidates?: MaybeReadonly<TensorHistoryExtra[]>
}

function TensorsList(props: TensorsListComponentProps) {
    const { candidates, details, item, ...restProps } = props
    const { uiState } = useDTP()

    const showSubitem = useCallback(
        (e: React.MouseEvent<HTMLElement>, tensorId?: string, maskId?: string) => {
            e.stopPropagation()
            if (!item || !tensorId) return
            uiState.showSubItem(item.project_id, tensorId, e.currentTarget, maskId)
        },
        [item, uiState.showSubItem],
    )

    if (!item || !details) return <MotionBox height={"60px"} {...restProps} />

    const { depthMapId, moodboard, customId, scribbleId, poseId, colorPaletteId, maskId } =
        details.images ?? {}
    const tensors = {
        Depth: depthMapId,
        Custom: customId,
        Scribble: scribbleId,
        Pose: poseId,
        Color: colorPaletteId,
        Mask: maskId,
    }

    // const previous = candidates?.filter((c) => c.tensor_id?.startsWith("tensor")) ?? []
    const canvasTensors = details.tensorData?.filter((t) => t.tensor_id)

    return (
        <Container {...restProps}>
            {Object.entries(tensors).map(([label, id]) => {
                if (!id) return null
                return (
                    <Group key={label}>
                        <Label>{label}</Label>
                        <Images>
                            <TensorThumbnail
                                key={label}
                                projectId={item.project_id}
                                tensorId={id}
                                onClick={(e) => showSubitem(e, id)}
                            />
                        </Images>
                    </Group>
                )
            })}
            <Spacer />
            {(moodboard?.length ?? 0) > 0 && (
                <Group>
                    <Label>Moodboard</Label>
                    <Images>
                        {moodboard?.map(([id, weight]) => (
                            <TensorThumbnail
                                key={id}
                                projectId={item.project_id}
                                tensorId={id}
                                onClick={(e) => showSubitem(e, id)}
                                weight={weight}
                            />
                        ))}
                    </Images>
                </Group>
            )}
            {!!canvasTensors?.length && canvasTensors.length > 1 && (
                <Group>
                    <Label>Canvas</Label>
                    <Images>
                        <CanvasCombinedButton
                            padding={2}
                            onClick={() => uiState.showCanvasStack(details)}
                        />
                        {canvasTensors?.map((ct) => {
                            if (!ct.tensor_id) return null
                            const tensorName = `tensor_history_${ct.tensor_id}`

                            return (
                                <TensorThumbnail
                                    key={ct.tensor_id}
                                    projectId={item.project_id}
                                    tensorId={tensorName}
                                    // maskId={
                                    //     ct.mask_id ? `binary_mask_${ct.mask_id}` : undefined
                                    // }
                                    onClick={(e) =>
                                        showSubitem(
                                            e,
                                            tensorName,
                                            ct.mask_id ? `binary_mask_${ct.mask_id}` : undefined,
                                        )
                                    }
                                />
                            )
                        })}
                    </Images>
                </Group>
            )}
        </Container>
    )
}

const Container = chakra(motion.div, {
    base: {
        display: "flex",
        flexWrap: "wrap",
        flexDirection: "row",
        padding: 0,
        height: "fit-content",
        // transform: "translateY(15px)",
    },
})

const Group = chakra(
    motion.div,
    {
        base: {
            position: "relative",
            display: "flex",
            flexDirection: "column",
            gap: 0,
            alignItems: "center",
            marginInline: 2,
        },
    },
    {
        defaultProps: {
            className: "group",
            initial: {
                scale: 0,
            },
            animate: {
                scale: 1,
            },
            transition: {
                duration: 0.2,
            },
        },
    },
)

const Images = chakra(
    "div",
    {
        base: {
            display: "flex",
            // bgColor: "white",
            flexDirection: "row",
            gap: 0,
            borderRadius: "lg",
            opacity: 0,
            _groupHover: {
                opacity: 1,
            },
            transition: "opacity 0.2s ease",
        },
    },
    {
        defaultProps: {
            "data-solid": true,
        },
    },
)

const Label = chakra("span", {
    base: {
        position: "absolute",
        fontSize: "sm",
        fontWeight: 700,
        color: "gray.300",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        transition: "all 0.2s ease",
    },
})

export default TensorsList
