import { Box, chakra, Spacer, Text, VStack } from "@chakra-ui/react"
import { motion } from "motion/react"
import { type ComponentProps, useCallback } from "react"
import type { DTImageFull, ImageExtra, TensorHistoryExtra } from "@/commands"
import { MotionBox, Tooltip } from "@/components"
import { useDTP } from "../state/context"
import TensorThumbnail, { CanvasCombinedButton } from "./TensorThumbnail"
import { TensorHistoryNode } from "@/commands/DTProjectTypes"

interface TensorsListComponentProps extends ComponentProps<typeof Container> {
    item?: ImageExtra
    details?: MaybeReadonly<TensorHistoryNode>
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

    const tensors = {
        Depth: details.depthMapId,
        Custom: details.customId,
        Scribble: details.scribbleId,
        Pose: details.poseId,
        Color: details.colorPaletteId,
        Mask: details.maskId,
    }

    // const previous = candidates?.filter((c) => c.tensor_id?.startsWith("tensor")) ?? []
    const canvasTensors = details.tensordata?.filter((t) => t.data.tensor_id)

    console.log(details)

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
            {(details.moodboard?.length ?? 0) > 0 && (
                <Group>
                    <Label>Moodboard</Label>
                    <Images>
                        {details.moodboard?.map((entry) => (
                            <TensorThumbnail
                                key={entry.rowid}
                                projectId={item.project_id}
                                tensorId={entry.tensor_name}
                                onClick={(e) => showSubitem(e, entry.tensor_name)}
                                weight={entry.weight}
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
                            if (!ct.tensor_name) return null

                            return (
                                <TensorThumbnail
                                    key={ct.tensor_name}
                                    projectId={item.project_id}
                                    tensorId={ct.tensor_name}
                                    // maskId={
                                    //     ct.mask_id ? `binary_mask_${ct.mask_id}` : undefined
                                    // }
                                    // onClick={(e) =>
                                    //     showSubitem(
                                    //         e,
                                    //         ct.tensor_name,
                                    //         ct.mask_name ? `binary_mask_${ct.mask_id}` : undefined,
                                    //     )
                                    // }
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
