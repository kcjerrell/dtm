import { Box } from "@chakra-ui/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { ImageExtra } from "@/commands"
import { Panel } from "@/components"
import PVGrid, {
	type PVGridItemComponent,
	type PVGridItemProps,
} from "@/components/virtualizedList/PVGrid2"
import { useDTP } from "../state/context"
import StatusBar from "./StatusBar"

interface ImagesList extends ChakraProps {}

const keyFn = (item: ImageExtra) => `${item.project_id}_${item.node_id}`

function ImagesList(props: ImagesList) {
	const { ...rest } = props

	const { images, uiState } = useDTP()
	const uiSnap = uiState.useSnap()
	const imagesSnap = images.useSnap()

	const itemSource = images.useItemSource()

	const showDetailsOverlay = useCallback(
		(index: number) => {
			images.itemSource.activeItemIndex = index
		},
		[images],
	)

	return (
		<Panel
			position="relative"
			margin={2}
			p={0.5}
			overflow={"clip"}
			flex={"1 1 auto"}
			bgColor={"bg.2"}
			{...rest}
		>
			<StatusBar width={"100%"} />
			<PVGrid<ImageExtra>
				freeze={!!uiSnap.detailsView?.item}
				bgColor={"transparent"}
				minHeight={"100%"}
				key={imagesSnap.searchId}
				itemComponent={GridItemAnim as PVGridItemComponent<ImageExtra>}
				itemSource={itemSource}
				maxItemSize={imagesSnap.imageSize ?? 5}
				onImagesChanged={images.onImagesChanged}
				gap={2}
				itemProps={{ showDetailsOverlay }}
				keyFn={keyFn}
			/>
		</Panel>
	)
}

function GridItemAnim(
	props: PVGridItemProps<
		ImageExtra,
		{
			showDetailsOverlay: (index: number) => void
		}
	>,
) {
	const { value: item, showDetailsOverlay, index } = props

	const previewId = `${item?.project_id}/${item?.preview_id}`
	const url = `dtm://dtproject/thumbhalf/${previewId}`

	return (
		<Box bgColor={"fg.1/20"} onClick={() => showDetailsOverlay(index)}>
			<motion.div
				key={url}
				style={{
					width: "100%",
					height: "100%",
				}}
				// transition={{ duration: 0.25 }}
			>
				<motion.img
					key={url}
					style={{
						width: "100%",
						height: "100%",
						objectFit: "cover",
						border: "1px solid #0000ff00",
						backgroundSize: "cover",
						backgroundPosition: "center",
					}}
					// variants={{
					// 	downscale: () => downScale(),
					// }}
					// initial="downscale"
					// animate={{ scale: 1 }}
					// exit="downscale"
					src={url}
					alt={item?.prompt}
					// transition={{ duration: 0.25 }}
				/>
			</motion.div>
		</Box>
	)
}

export default ImagesList
