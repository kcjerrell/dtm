import { ImageExtra, TensorHistoryExtra } from "@/commands"
import { Panel, DataItem } from "@/components"
import { extractConfigFromTensorHistoryNode, samplerLabels } from "@/utils/config"
import { Box, chakra } from "@chakra-ui/react"
import { motion } from "motion/react"
import { Snapshot } from "valtio"

interface DetailsContentProps extends ChakraProps {
	item?: Snapshot<ImageExtra> | null
	details?: Snapshot<TensorHistoryExtra> | null
}

function DetailsContent(props: DetailsContentProps) {
	const { item, details, ...boxProps } = props

	const config = extractConfigFromTensorHistoryNode(details?.history)

	if (!item) return null

	return (
		<Panel
			flex={"1 1 auto"}
			overflowY={"scroll"}
			overflowX={"clip"}
			margin={4}
			onClick={(e) => e.stopPropagation()}
			{...boxProps}
			asChild
		>
			<motion.div
				variants={{
					open: {
						opacity: 1,
						transition: {
							duration: 0.5 * 0.75,
							delay: 0.5 * 0.25,
						},
					},
					closed: {
						opacity: 0,
						transition: { duration: 0.5 },
					},
				}}
				initial={"closed"}
				animate={"open"}
				exit={"closed"}
			>
				<Row>
					<DataItem.Size width={config?.width} height={config?.height} />
					<DataItem.Seed seed={config?.seed} seedMode={config?.seedMode} />
				</Row>
				<Row>
					<DataItem label={"Model"} data={config?.model} />
					<DataItem.Strength strength={config?.strength} />
				</Row>
				<Row>
					<DataItem.Sampler sampler={config?.sampler} />
					<DataItem label={"Steps"} data={config?.steps} />
					<DataItem label={"Text Guidance"} data={config?.guidanceScale} />
					<DataItem label={"Shift"} data={config?.shift} />
				</Row>
				<DataItem label={"Prompt"} data={item.prompt} maxLines={6} />
				<DataItem label={"Negative Prompt"} data={item.negative_prompt} maxLines={6} />
				<DataItem label={"Tensor ID"} data={details?.tensor_id} />
				<DataItem label={"Depth Map ID"} data={details?.depth_map_id} />
				<DataItem label={"Pose ID"} data={details?.pose_id} />
				<DataItem label={"Scribble ID"} data={details?.scribble_id} />
				<DataItem label={"Color Palette ID"} data={details?.color_palette_id} />
				<DataItem label={"Custom ID"} data={details?.custom_id} />
				<DataItem label={"Raw"} data={JSON.stringify(details, null, 2)} />
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
