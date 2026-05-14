import { chakra, Grid, Spacer } from "@chakra-ui/react"
import { motion } from "motion/react"
import { Fragment } from "react/jsx-runtime"
import { TbWindowMinimize } from "react-icons/tb"
import type { Snapshot } from "valtio"
import type { DTImageFull, ImageExtra } from "@/commands"
import { IconButton, Panel } from "@/components"
import DataItem from "@/components/DataItem"
import Tabs from "@/metadata/infoPanel/tabs"
import { useDTP } from "../state/context"
import DetailsFallback from "./DetailsFallback"
import { useDTImage } from "./DTImageContext"
import { TensorHistoryNode } from "@/commands/DTProjectTypes"

interface DetailsContentProps extends ChakraProps {
    item?: Snapshot<ImageExtra> | null
    details?: Snapshot<TensorHistoryNode> | null
    tuck?: boolean
}

function DetailsContent(props: DetailsContentProps) {
    const { tuck, item, details, ...boxProps } = props
    const { uiState } = useDTP()
    const uiSnap = uiState.useSnap()
    const snap = uiSnap.detailsView

    const { loras, controls } = useDTImage()

    if (!details || item?.is_ready === false) return <DetailsFallback item={item} />

    const config = details.groupedConfig
    if (!item || !config) return null

    return (
        <Panel
            flex={"1 1 auto"}
            overflow={"clip"}
            onClick={(e) => e.stopPropagation()}
            padding={0}
            alignSelf={"flex-start"}
            {...boxProps}
            asChild
        >
            <Tabs.Root defaultValue={"details"} padding={0}>
                <Tabs.List flex={"0 0 auto"}>
                    <Tabs.Trigger
                        height={"2rem"}
                        value="details"
                        display={snap.minimizeContent ? "none" : undefined}
                    >
                        Details
                    </Tabs.Trigger>
                    <Tabs.Trigger
                        height={"2rem"}
                        value="raw"
                        display={snap.minimizeContent ? "none" : undefined}
                    >
                        Raw
                    </Tabs.Trigger>
                    <Spacer />
                    <IconButton
                        rotate={snap.minimizeContent ? "0deg" : "180deg"}
                        onClick={() => {
                            uiState.minimizeContent()
                        }}
                    >
                        <TbWindowMinimize />
                    </IconButton>
                </Tabs.List>
                <Tabs.Content
                    height="auto"
                    value={"raw"}
                    padding={2}
                    flex={"1 1 auto"}
                    className="panel-scroll"
                    display={snap.minimizeContent ? "none" : undefined}
                    overflowY={"auto"}
                >
                    <DataItem size={"sm"} label={"Raw"} data={JSON.stringify(details, null, 2)} />
                </Tabs.Content>

                <Tabs.Content
                    height="auto"
                    value="details"
                    padding={2}
                    flex={"1 1 auto"}
                    display={snap.minimizeContent ? "none" : undefined}
                    className="panel-scroll"
                    overflowY={"auto"}
                >
                    {/* <Grid
                            overflowY={"auto"}
                            gridTemplateColumns={"1fr 1fr"}
                            key={snap?.item?.id}
                            gap={2}
                            padding={1}
                        >
                            <DataItem
                                size={"sm"}
                                label={"Prompt"}
                                data={snap.itemDetails.prompt?.trim() || "(none)"}
                                gridColumn={"span 2"}
                                maxLines={8}
                            />
                            <DataItem
                                size={"sm"}
                                label={"Negative Prompt"}
                                data={snap.itemDetails?.negativePrompt?.trim() || "(none)"}
                                gridColumn={"span 2"}
                                maxLines={8}
                            />
                            {Object.keys(groupedConfig).map((key) => {
                                const value = groupedConfig?.[key as keyof typeof groupedConfig]

                                return (
                                    <DataItemTemplate
                                        key={key}
                                        property={key as keyof typeof groupedConfig}
                                        value={value}
                                    />
                                )
                            })} */}
                    <Fragment key={details.rowid}>
                        <Row>
                            <DataItem
                                label={"Project"}
                                data={details.project_path.replace(/\.sqlite3$/, "")}
                            />
                            <DataItem
                                label={"Created"}
                                data={
                                    details.data.wall_clock
                                        ? new Date(details.data.wall_clock).toLocaleString()
                                        : undefined
                                }
                            />
                        </Row>
                        <Row>
                            <DataItem.Size value={config.size} />
                            <DataItem.Seed value={config.seed} />
                        </Row>
                        <Row>
                            <DataItem.Model value={config.model} />
                        </Row>
                        {/* LoRAs */}
                        {(details.data.loras?.length ?? 0) > 0 &&
                            details.data.loras?.map((lora, i) => {
                                const name = loras?.[i]?.name || lora.file
                                return (
                                    <Row key={`lora-${lora.file}`}>
                                        <DataItem
                                            label={"LoRA"}
                                            data={`${name}, (Weight: ${Math.round(lora.weight * 100)}%)`}
                                        />
                                    </Row>
                                )
                            })}

                        {/* Controls */}
                        {(details.data.controls?.length ?? 0) > 0 &&
                            details.data.controls?.map((control, i) => {
                                const name = controls?.[i]?.name || control.file
                                return (
                                    <Row key={`control-${control.file}`}>
                                        <DataItem
                                            label={"Control"}
                                            data={`${name} (Weight: ${Math.round(control.weight * 100)}%, from ${Math.round(control.guidance_start * 100)}% to ${Math.round(control.guidance_end * 100)}%)`}
                                        />
                                    </Row>
                                )
                            })}
                        <Row>
                            <DataItem.Sampler value={config.sampler} />
                            <DataItem.Steps value={config.steps} />
                        </Row>
                        <Row>
                            <DataItem.Strength value={config.strength} />
                            <DataItem.GuidanceScale value={config.guidanceScale} />
                            <DataItem.Shift value={config.shift} />
                        </Row>
                        <DataItem label={"Prompt"} data={item.prompt} maxLines={6} />
                        <DataItem
                            label={"Negative Prompt"}
                            data={item.negative_prompt}
                            maxLines={6}
                        />
                        <Grid templateColumns="auto auto" gap={2} mb={2}>
                            <DataItem.HiresFix value={config.hiresFix} />
                            <DataItem.Refiner value={config.refiner} />
                            <DataItem.TiledDecoding value={config.tiledDecoding} />
                            <DataItem.TiledDiffusion value={config.tiledDiffusion} />
                            <DataItem.Upscaler value={config.upscaler} />
                            {/* <DataItem.Batch value={config.batch} /> */}
                            <DataItem.NumFrames value={item.num_frames ?? undefined} />
                            <DataItem.CausalInference value={config.causalInference} />
                            <DataItem.CfgZero value={config.cfgZero} />
                            <DataItem.MaskBlur value={config.maskBlur} />
                            <DataItem
                                label={"Mask Outset"}
                                data={details.groupedConfig?.maskBlur?.outset}
                            />
                            <DataItem.Sharpness value={config.sharpness} />
                            <DataItem.Stage2 value={config.stage2} />
                            <DataItem.ImagePrior value={config.imagePrior} />
                            <DataItem.AestheticScore value={config.aestheticScore} />
                            <DataItem.TeaCache value={config.teaCache} />
                        </Grid>
                        <DataItem label={"Node ID"} data={item.node_id} />
                        <DataItem label={"Lineage"} data={details.lineage} />
                        <DataItem label={"Logical Time"} data={details.logicalTime} />
                        <DataItem label={"Tensor ID"} data={details.tensorId} />
                        <DataItem label={"Depth Map ID"} data={details.depthMapId} />
                        <DataItem label={"Pose ID"} data={details.poseId} />
                        <DataItem label={"Scribble ID"} data={details.scribbleId} />
                        <DataItem label={"Color Palette ID"} data={details.colorPaletteId} />
                        <DataItem label={"Custom ID"} data={details.customId} />
                        {(details.moodboard?.length ?? 0) > 0 && (
                            <DataItem
                                label={"Moodboard IDs"}
                                data={details.moodboard?.map((mb) => mb.tensor_name).join("\n")}
                            />
                        )}
                    </Fragment>
                    {/* </Grid> */}
                </Tabs.Content>
            </Tabs.Root>
        </Panel>
    )
}

const Row = chakra("div", {
    base: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "flex-start",
        alignItems: "center",
        mb: 2,
        gap: 2,
        "&>*": {
            flex: "1 1 auto",
        },
    },
})

export default DetailsContent
