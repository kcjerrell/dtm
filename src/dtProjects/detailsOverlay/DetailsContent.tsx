import { chakra, Grid } from "@chakra-ui/react"
import { motion } from "motion/react"
import type { Snapshot } from "valtio"
import type { DTImageFull, ImageExtra } from "@/commands"
import { Panel } from "@/components"
import DataItem, { DataItemTemplate } from "@/components/DataItem"
import Tabs from "@/metadata/infoPanel/tabs"
import { useDTP } from "../state/context"

interface DetailsContentProps extends ChakraProps {
    item?: Snapshot<ImageExtra> | null
    details?: Snapshot<DTImageFull> | null
}

function DetailsContent(props: DetailsContentProps) {
    const { ...boxProps } = props
    const { uiState } = useDTP()
    const { detailsView: snap } = uiState.useSnap()
    const config = snap?.itemDetails?.config
    console.log(snap)
    if (!snap.itemDetails || !config) return null

    return (
        <Panel
            flex={"1 1 auto"}
            overflow={"clip"}
            padding={0}
            onClick={(e) => e.stopPropagation()}
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
                <Tabs.Root overflowY={"auto"} defaultValue={"details"}>
                    <Tabs.List>
                        <Tabs.Trigger height={"2rem"} value="details">
                            Details
                        </Tabs.Trigger>
                        <Tabs.Trigger height={"2rem"} value="raw">
                            Raw
                        </Tabs.Trigger>
                    </Tabs.List>
                    <Tabs.Content value={"raw"}>
                        <DataItem
                            size={"sm"}
                            label={"Raw"}
                            data={JSON.stringify(snap.itemDetails, null, 2)}
                        />
                    </Tabs.Content>

                    <Tabs.Content value="details">
                        <Grid
                            overflowY={"auto"}
                            gridTemplateColumns={"1fr 1fr"}
                            key={snap?.item?.id}
                            gap={4}
                            padding={4}
                        >
                            <DataItem
                                size={"md"}
                                label={"Prompt"}
                                data={snap.itemDetails.prompt}
                                gridColumn={"span 2"}
                                maxLines={4}
                            />
                            <DataItem
                                size={"md"}
                                label={"Negative Prompt"}
                                data={snap.itemDetails?.negativePrompt || "(none)"}
                                gridColumn={"span 2"}
                            />
                            {Object.keys(config).map((key) => {
                                const value = config?.[key as keyof typeof config]

                                return (
                                    <DataItemTemplate
                                        key={key}
                                        property={key as keyof typeof config}
                                        value={value}
                                    />
                                )
                            })}
                            {/* <Fragment key={snap.itemDetails?.tensor_id || "details_content"}>
						<Row>
							<DataItem.Size value={config.size} />
							<DataItem.Seed value={config.seed} />
						</Row>
						<Row>
							<DataItem.Model value={config.model} />
							<DataItem.Strength value={config.strength} />
						</Row>
						<Row>
							<DataItem.Sampler value={config.sampler} />
							<DataItem.Steps value={config.steps} />
							<DataItem.GuidanceScale value={config.guidanceScale} />
							<DataItem.Shift value={config.shift} />
						</Row>
						<DataItem label={"Prompt"} data={snap.item.prompt} maxLines={6} />
						<DataItem label={"Negative Prompt"} data={snap.item.negative_prompt} maxLines={6} />
						<Row>
							<DataItem.HiresFix value={config.hiresFix} />
							<DataItem.Refiner value={config.refiner} />
						</Row>
						<Row>
							<DataItem.TiledDecoding value={config.tiledDecoding} />
							<DataItem.TiledDiffusion value={config.tiledDiffusion} />
						</Row>
						<Row>
							<DataItem.Upscaler value={config.upscaler} />
							<DataItem.Batch value={config.batch} />
						</Row>
						<Row>
							<DataItem.CausalInference value={config.causalInference} />
							<DataItem.CfgZero value={config.cfgZero} />
						</Row>
						<Row>
							<DataItem.MaskBlur value={config.maskBlur} />
							<DataItem.Sharpness value={config.sharpness} />
						</Row>
						<Row>
							<DataItem.Stage2 value={config.stage2} />
							<DataItem.ImagePrior value={config.imagePrior} />
						</Row>
						<Row>
							<DataItem.AestheticScore value={config.aestheticScore} />
							<DataItem.TeaCache value={config.teaCache} />
						</Row>
						<DataItem label={"Tensor ID"} data={snap.itemDetails?.tensor_id} />
						<DataItem label={"Depth Map ID"} data={snap.itemDetails?.depth_map_id} />
						<DataItem label={"Pose ID"} data={snap.itemDetails?.pose_id} />
						<DataItem label={"Scribble ID"} data={snap.itemDetails?.scribble_id} />
						<DataItem label={"Color Palette ID"} data={snap.itemDetails?.color_palette_id} />
						<DataItem label={"Custom ID"} data={snap.itemDetails?.custom_id} />
						<DataItem label={"Raw"} data={JSON.stringify(snap.itemDetails, null, 2)} />
					</Fragment> */}
                        </Grid>
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
        "&>*": {
            flex: "1 1 auto",
        },
    },
})

export default DetailsContent
