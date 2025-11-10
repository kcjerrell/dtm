import { Box, HStack, Image, VStack } from "@chakra-ui/react"
import { MeasureGrid } from "@/components"
import { showPreview } from "@/components/preview"
import type { VirtualizedListItemProps } from "@/components/virtualizedList/VirtualizedList"
import DataItem from "@/metadata/infoPanel/DataItem"
import { ImageExtra } from "@/commands"
import { DTProjectsState } from "../state/projectStore"
import { PVListItemProps } from "@/components/virtualizedList/PVLIst"

interface ImagesListItemProps {
	snap: ReadonlyState<DTProjectsState>
	onSelect: (index: number) => void
}

function ImagesListItem(props: PVListItemProps<ImageExtra, ImagesListItemProps>) {
	const { index, itemProps, value: item } = props
	const { snap, onSelect } = itemProps
	const expanded = snap.expandedItems[index]

	const elemProps = {
		boxShadow: "sm",
		borderRadius: "md",
		padding: 1,
		_hover: { bgColor: "bg.0" },
	} as ChakraProps

	const details = expanded ? (snap.itemDetails[index] ?? null) : undefined

	if (!item)
		return (
			<HStack width={"100%"} {...elemProps}>
				<Box flex={"0 0 auto"} width={"8rem"} height={"8rem"} bgColor={"gray"} />
				<Box>Loading...</Box>
			</HStack>
		)

	const row = (
		<VStack key={item?.row_id || index} width={"100%"} {...elemProps}>
			<HStack
				width={"100%"}
				alignItems={"flex-start"}
				// bgColor={"bg.2"}
				gap={2}
				onClick={() => onSelect(index)}
			>
				<Box position={"relative"} flex={"0 0 auto"}>
					<Image
						src={`dtm://dtproject/thumbhalf/${item.project_id}/${item.dt_id}`}
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

						return <DataItem key={k} label={k} data={v} onClick={onClick} />
					})}
				</MeasureGrid>
			)}
		</VStack>
	)

	return row
}

export default ImagesListItem
