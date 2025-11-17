import { Box, HStack, Image, VStack } from "@chakra-ui/react"
import type { ImageExtra } from "@/commands"
import { MeasureGrid } from "@/components"
import { showPreview } from "@/components/preview"
import type { PVListItemProps } from "@/components/virtualizedList/PVLIst"
import DataItem from "@/metadata/infoPanel/DataItem"
import { type DTProjectsStateType, selectItem } from "../state/projectStore"

interface ImagesListItemProps {
	snap: ReadonlyState<DTProjectsStateType>
	onSelect: (index: number) => void
}

function ImagesListItem(props: PVListItemProps<ImageExtra, ImagesListItemProps>) {
	const { index, itemProps, value: item, onSizeChanged } = props
	const { snap } = itemProps

	const elemProps = {
		boxShadow: "sm",
		borderRadius: "md",
		padding: 1,
		_hover: { bgColor: "bg.0" },
	} as ChakraProps

	if (!item)
		return (
			<HStack width={"100%"} {...elemProps}>
				<Box flex={"0 0 auto"} width={"8rem"} height={"8rem"} bgColor={"gray"} />
				<Box>Loading...</Box>
			</HStack>
		)

	const expanded = snap.expandedItems[item.node_id]
	const details = expanded ? (snap.itemDetails[item.node_id] ?? null) : undefined
	console.log(toJSON(item))
	const row = (
		<VStack width={"100%"} {...elemProps}>
			<HStack
				width={"100%"}
				alignItems={"flex-start"}
				gap={2}
				onClick={() => {
					selectItem(item)
					onSizeChanged?.(index, snap.expandedItems[item.node_id])
				}}
			>
				<Box position={"relative"} flex={"0 0 auto"}>
					<Image
						src={`dtm://dtproject/thumbhalf/${item.project_id}/${item.preview_id}`}
						alt={item.prompt}
						width={"8rem"}
						height={"8rem"}
						objectFit={"contain"}
						onClick={(e) => {
							if (expanded) e.stopPropagation()
							if (details?.tensor_id)
								showPreview(
									e.currentTarget,
									`dtm://dtproject/tensor/${item.project_id}/${details.tensor_id}`,
								)
						}}
					/>
					<Box position={"absolute"} bottom={1} right={1}>
						{index}
					</Box>
				</Box>
				<VStack alignItems={"stretch"} height={"8rem"}>
					<Box
						fontSize={"xs"}
						color={"fg.1"}
						flex={"1 1 auto"}
						overflow={"clip"}
						textOverflow={"ellipsis"}
					>
						{item.prompt}
					</Box>
					<Box
						fontSize={"xs"}
						color={"fg.2"}
						fontStyle={"italic"}
						flex={"0 1 auto"}
						overflow={"clip"}
						textOverflow={"ellipsis"}
					>
						{item.negative_prompt}
					</Box>
					<Box fontSize={"xs"} flex={"0 0 auto"}>
						Model: {item.model_file}
					</Box>
				</VStack>
				{/* <Box bgColor={"bg.2"}>{item.image_id}</Box> */}
			</HStack>
			{expanded && details === null && <Box>Loading...</Box>}
			{expanded && details !== null && details && (
				<MeasureGrid columns={2} maxItemLines={4} padding={2}>
					{Object.entries(details).map(([k, v]) => {
						if (v === undefined || v === null) return null
						let onClick = (_: React.MouseEvent) => {}
						if (
							[
								"tensor_id",
								"depth_map_id",
								"pose_id",
								"mask_id",
								"custom_id",
								"scribble_id",
								"color_pallete_id",
							].includes(k) &&
							typeof v === "string"
						)
							onClick = async (e) => {
								console.log(e, `dtm://dtproject/tensor/${item.project_id}/${v}`)
								// const image = await DTProjectsStore.getTensor(details.project_path, v as string)
								showPreview(null, `dtm://dtproject/tensor/${item.project_id}/${v}`)
							}

						return (
							<DataItem key={k} label={k} data={v} onClick={onClick} initialCollapse={"expanded"} />
						)
					})}
				</MeasureGrid>
			)}
		</VStack>
	)

	return row
}

export default ImagesListItem
