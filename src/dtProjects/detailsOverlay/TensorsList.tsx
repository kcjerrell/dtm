import { chakra, Spacer } from "@chakra-ui/react"
import { motion } from "motion/react"
import { type ComponentProps, Fragment, useCallback } from "react"
import type { ImageExtra } from "@/commands"
import type { TensorHistoryNode } from "@/commands/DTProjectTypes"
import { MotionBox, Tooltip } from "@/components"
import { useDTP } from "../state/context"
import TensorThumbnail, { CanvasCombinedButton } from "./TensorThumbnail"

interface TensorsListComponentProps extends ComponentProps<typeof Container> {
    item?: ImageExtra
    details?: MaybeReadonly<TensorHistoryNode>
    candidates?: MaybeReadonly<TensorHistoryNode[]>
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
        Depth: details.depthMapName,
        Custom: details.customName,
        Scribble: details.scribbleName,
        Pose: details.poseName,
        Color: details.colorPaletteName,
        Mask: details.maskName,
    }

    const canvasTensors = details.tensordata?.filter((t) => t.data.tensor_id)

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
            {candidates && candidates.length > 0 && (
                <Group>
                    <Label>Previous</Label>
                    <Images>
                        {candidates
                            .filter((c) => c.tensorHistoryName)
                            .map((c) => (
                                <Fragment key={c.rowid}>
                                    <Tooltip
                                        tipTitle={"Input image"}
                                        tipText={`Lineage: ${c.lineage}, Logical time: ${c.logicalTime}`}
                                    >
                                        <TensorThumbnail
                                            projectId={item.project_id}
                                            tensorId={c.tensorHistoryName}
                                            maskId={c.maskName}
                                            onClick={(e) => showSubitem(e, c.tensorHistoryName, c.maskName)}
                                        />
                                    </Tooltip>
                                    {/* {c.maskName && (
                                        <TensorThumbnail
                                            projectId={item.project_id}
                                            tensorId={c.maskName}
                                            onClick={(e) => showSubitem(e, c.maskName)}
                                        />
                                    )} */}
                                </Fragment>
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
                            if (!ct.data.tensor_id) return null
                            const ctTensorId = `tensor_history_${ct.data.tensor_id}`

                            return (
                                <TensorThumbnail
                                    key={ct.rowid}
                                    projectId={item.project_id}
                                    tensorId={ctTensorId}
                                    maskId={ct.mask}
                                    onClick={(e) => showSubitem(e, ctTensorId, ct.mask)}
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
