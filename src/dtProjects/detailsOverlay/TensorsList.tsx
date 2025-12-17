import { Spacer } from "@chakra-ui/react/spacer"
import { VStack } from "@chakra-ui/react/stack"
import { chakra } from "@chakra-ui/react/styled-system"
import { Text } from "@chakra-ui/react/text"
import { motion } from "motion/react"
import { type ComponentProps, useCallback } from "react"
import type { ImageExtra, TensorHistoryExtra } from "@/commands"
import { MotionBox, Tooltip } from "@/components"
import { useDTP } from "../state/context"
import TensorThumbnail from "./TensorThumbnail"

interface TensorsListComponentProps extends ComponentProps<typeof Container> {
	item?: ImageExtra
	details?: MaybeReadonly<TensorHistoryExtra>
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

	const {
		depth_map_id,
		moodboard_ids,
		custom_id,
		scribble_id,
		pose_id,
		color_palette_id,
		mask_id,
	} = details
	const tensors = {
		Depth: depth_map_id,
		Custom: custom_id,
		Scribble: scribble_id,
		Pose: pose_id,
		Color: color_palette_id,
		Mask: mask_id,
	}

	const previous = candidates?.filter((c) => c.tensor_id?.startsWith("tensor")) ?? []

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
			{moodboard_ids.length > 0 && (
				<Group>
					<Label>Moodboard</Label>
					<Images>
						{moodboard_ids.map((id) => (
							<TensorThumbnail
								key={id}
								projectId={item?.project_id}
								tensorId={id}
								onClick={(e) => showSubitem(e, id)}
							/>
						))}
					</Images>
				</Group>
			)}
			{previous.length > 0 && (
				<Group>
					<Label>Canvas</Label>
					<Images>
						{previous.map((prev) => {
							if (!prev.tensor_id) return null

							return (
								<Tooltip
									key={prev.row_id}
									tip={
										<VStack alignItems={"flex-start"}>
											<Text>{`(${prev.row_id}) lineage: ${prev.lineage}, logical time: ${prev.logical_time}`}</Text>
											<Text>
												Note: It is not alway possible to identify the canvas image, or determine if
												it was used in the generation.
											</Text>
										</VStack>
									}
								>
									<TensorThumbnail
										projectId={item?.project_id}
										tensorId={prev.tensor_id}
										maskId={prev.mask_id}
										onClick={(e) => showSubitem(e, prev.tensor_id, prev.mask_id)}
									/>
								</Tooltip>
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
		flexDirection: "row",
		padding: 0,
		height: "60px",
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

const Images = chakra("div", {
	base: {
		display: "flex",
		bgColor: "white",
		flexDirection: "row",
		// height: _thumbnailSize,
		gap: 0,
		// padding: 0.5,
		borderRadius: "lg",
		// boxShadow: "0px 2px 14px -5px #00000044, 0px 1px 8px -3px #00000044, 1px 0px 3px 0px #00000044",
		opacity: 0,
		_groupHover: {
			opacity: 1,
		},
		transition: "opacity 0.2s ease",
	},
})

const Label = chakra("span", {
	base: {
		position: "absolute",
		fontSize: "xs",
		fontWeight: 700,
		color: "gray.300",
		top: "50%",
		left: "50%",
		transform: "translate(-50%, -50%)",
		transition: "all 0.2s ease",
	},
})

export default TensorsList
