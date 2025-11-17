import { ImageExtra, TensorHistoryExtra } from "@/commands"
import urls from "@/commands/urls"
import { Tooltip } from "@/components"
import ColorPaletteImage from "@/components/ColorPalette"
import PoseImage from "@/components/Pose"
import { Box, chakra, Color, HStack, Spacer, VStack } from "@chakra-ui/react"
import { motion } from "motion/react"

const _thumbnailSize = "4rem"

interface TensorsListComponentProps extends ChakraProps {
	item?: ImageExtra
	details?: TensorHistoryExtra
	candidates?: TensorHistoryExtra[]
}

function TensorsList(props: TensorsListComponentProps) {
	const { candidates, details, item, ...restProps } = props

	if (!item || !details) return <Box height={"6rem"} {...restProps} />

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

	return (
		<HStack padding={0} height={"6rem"} {...restProps}>
			{Object.entries(tensors).map(([label, id]) => {
				if (!id) return null
				// if (label === "Pose")
				// 	return <PoseImage key={label} projectId={item.project_id} tensorId={id}/>
				return (
					<Group key={label}>
						<Images>
							{label === "Color" ? (
								<ColorPaletteImage
									key={label}
									projectId={item.project_id}
									tensorId={id}
									height={_thumbnailSize}
									width={_thumbnailSize}
								/>
							) : label === "Pose" ? (
								<PoseImage
									key={label}
									projectId={item.project_id}
									tensorId={id}
									height={_thumbnailSize}
									width={_thumbnailSize}
								/>
							) : (
								<Thumbnail src={urls.tensor(item?.project_id, id)} />
							)}
						</Images>
						<Label>{label}</Label>
					</Group>
				)
			})}
			<Spacer />
			{candidates && candidates.length > 0 && (
				<Group>
					<Images>
						{candidates.map((candidate) => {
							if (!candidate.tensor_id) return null

							return (
								<Tooltip
									key={candidate.row_id}
									tip={`(${candidate.row_id}) lineage: ${candidate.lineage}, logical time: ${candidate.logical_time}`}
								>
									<Thumbnail src={urls.tensor(item?.project_id, candidate.tensor_id)} />
								</Tooltip>
							)
						})}
					</Images>
					<Label>Previous</Label>
				</Group>
			)}
			{moodboard_ids.length > 0 && (
				<Group>
					<Images>
						{moodboard_ids.map((id) => (
							<Thumbnail key={id} src={urls.tensor(item?.project_id, id)} />
						))}
					</Images>
					<Label>Moodboard</Label>
				</Group>
			)}
		</HStack>
	)
}

const Group = chakra(
	motion.div,
	{
		base: {
			display: "flex",
			flexDirection: "column",
			gap: 0,
			alignItems: "center",
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
		flexDirection: "row",
		// height: _thumbnailSize,
		gap: 0,
		// padding: 0.5,
		borderRadius: "lg",
		boxShadow: "0px 2px 14px -5px #00000044, 0px 1px 8px -3px #00000044, 1px 0px 3px 0px #00000044",
	},
})

const Label = chakra("span", {
	base: {
		fontSize: "xs",
		fontWeight: 700,
		color: "gray.300",
		opacity: 0,
		verticalAlign: "top",
		_groupHover: {
			opacity: 1,
		},
		transition: "all 0.2s ease",
	},
})

const Thumbnail = chakra("img", {
	base: {
		width: _thumbnailSize,
		height: _thumbnailSize,
		objectFit: "cover",
		bgColor: "#00000055",
		transformOrigin: "center bottom",
		_first: {
			borderInlineStartRadius: "lg",
		},
		_last: {
			borderInlineEndRadius: "lg",
		},
		_hover: {
			transform: "scale(1.1)",
			zIndex: 1,
			transition: "all 0.1s ease",
			boxShadow:
				"0px 2px 14px -5px #00000044, 0px 1px 8px -3px #00000044, 1px 0px 3px 0px #00000044",
		},
		transition: "all 0.2s ease",
	},
})

export default TensorsList
