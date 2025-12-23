import { chakra, Grid } from "@chakra-ui/react"
import { motion } from "motion/react"
import type { Snapshot } from "valtio"
import type { ImageExtra, TensorHistoryExtra } from "@/commands"
import { Panel } from "@/components"
import { DataItemTemplate } from "@/components/DataItem"
import { useDTP } from "../state/context"

interface DetailsContentProps extends ChakraProps {
	item?: Snapshot<ImageExtra> | null
	details?: Snapshot<TensorHistoryExtra> | null
}

function DetailsContent(props: DetailsContentProps) {
	const { ...boxProps } = props
	const { uiState } = useDTP()
	const { detailsView: snap } = uiState.useSnap()

	if (!snap.config) return null

	return (
		<Panel
			flex={"1 1 auto"}
			overflowY={"scroll"}
			overflowX={"clip"}
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
				Config
				<Grid gridTemplateColumns={"1fr 1fr"} key={snap?.item?.id} gap={1} paddingX={4}>
					{Object.keys(snap.config).map((key) => {
						const value = snap.config?.[key as keyof typeof snap.config]

						return (
							<DataItemTemplate
								key={key}
								property={key as keyof typeof snap.config}
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
