import { chakra } from "@chakra-ui/react"
import { motion } from "motion/react"
import { Fragment } from "react/jsx-runtime"
import type { Snapshot } from "valtio"
import type { ImageExtra, TensorHistoryExtra } from "@/commands"
import { DataItem, Panel } from "@/components"
import { extractConfigFromTensorHistoryNode } from "@/utils/config"
import { useDTP } from "../state/context"

interface DetailsContentProps extends ChakraProps {
	item?: Snapshot<ImageExtra> | null
	details?: Snapshot<TensorHistoryExtra> | null
}

function DetailsContent(props: DetailsContentProps) {
	const { ...boxProps } = props
	const { uiState } = useDTP()
	const { detailsView: snap } = uiState.useSnap()
	const config = extractConfigFromTensorHistoryNode(snap.itemDetails?.history)

	if (!snap.item) return null

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
				<Fragment key={snap.itemDetails?.tensor_id || "details_content"}>
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
					<DataItem label={"Prompt"} data={snap.item.prompt} maxLines={6} />
					<DataItem label={"Negative Prompt"} data={snap.item.negative_prompt} maxLines={6} />
					<DataItem label={"Tensor ID"} data={snap.itemDetails?.tensor_id} />
					<DataItem label={"Depth Map ID"} data={snap.itemDetails?.depth_map_id} />
					<DataItem label={"Pose ID"} data={snap.itemDetails?.pose_id} />
					<DataItem label={"Scribble ID"} data={snap.itemDetails?.scribble_id} />
					<DataItem label={"Color Palette ID"} data={snap.itemDetails?.color_palette_id} />
					<DataItem label={"Custom ID"} data={snap.itemDetails?.custom_id} />
					<DataItem label={"Raw"} data={JSON.stringify(snap.itemDetails, null, 2)} />
				</Fragment>
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
