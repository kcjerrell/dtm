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

interface DetailsContentProps extends ChakraProps {
    item?: Snapshot<ImageExtra> | null
    details?: Snapshot<DTImageFull> | null
    tuck?: boolean
}

function DetailsContent(props: DetailsContentProps) {
    const { tuck, ...boxProps } = props
    const { uiState } = useDTP()
    const uiSnap = uiState.useSnap()
    const snap = uiSnap.detailsView

    const { loras, controls } = useDTImage()

    const item = snap.item
    const details = snap.itemDetails

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
            <motion.div
                variants={{
                    open: {
                        opacity: 1,
                        transition: {
                            duration: 0.25,
                            ease: "easeInOut",
                        },
                        // height: "auto",
                    },
                    closed: {
                        opacity: 0,
                        transition: { duration: 0.25 },
                    },
                }}
                initial={"closed"}
                animate={"open"}
                exit={"closed"}
            >
                <Tabs.Root overflowY={"auto"} defaultValue={"details"} className={"panel-scroll"}>
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
                    <Tabs.Content value={"raw"} padding={2} flex={"1 1 auto"}>
                        <DataItem
                            size={"sm"}
                            label={"Raw"}
                            data={JSON.stringify(details, null, 2)}
                        />
                    </Tabs.Content>

                    <Tabs.Content
                        value="details"
                        padding={2}
                        flex={"1 1 auto"}
                        display={snap.minimizeContent ? "none" : undefined}
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
                        <Fragment key={details.id}>
                            <Row>
                                <DataItem
                                    label={"Project"}
                                    data={details.project.name.replace(/\.sqlite3$/, "")}
                                />
                                <DataItem
                                    label={"Created"}
                                    data={
                                        details.node.wall_clock
                                            ? new Date(details.node.wall_clock).toLocaleString()
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
                            {(details.node.loras?.length ?? 0) > 0 &&
                                details.node.loras?.map((lora, i) => {
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
                            {(details.node.controls?.length ?? 0) > 0 &&
                                details.node.controls?.map((control, i) => {
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
                            <DataItem label={"Lineage"} data={details.node.lineage} />
                            <DataItem label={"Logical Time"} data={details.node.logical_time} />
                            <DataItem label={"Tensor ID"} data={details.images?.tensorId} />
                            <DataItem label={"Depth Map ID"} data={details.images?.depthMapId} />
                            <DataItem label={"Pose ID"} data={details.images?.poseId} />
                            <DataItem label={"Scribble ID"} data={details.images?.scribbleId} />
                            <DataItem
                                label={"Color Palette ID"}
                                data={details.images?.colorPaletteId}
                            />
                            <DataItem label={"Custom ID"} data={details.images?.customId} />
                            {(details.images?.moodboard?.length ?? 0) > 0 && (
                                <DataItem
                                    label={"Moodboard IDs"}
                                    data={details.images?.moodboard?.map(([id]) => id).join("\n")}
                                />
                            )}
                        </Fragment>
                        {/* </Grid> */}
                    </Tabs.Content>
                </Tabs.Root>
            </motion.div>
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
