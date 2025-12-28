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
		(item: ImageExtra, elem?: HTMLImageElement) => {
			uiState.showDetailsOverlay(item, elem)
		},
		[uiState],
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
				itemComponent={GridItem as PVGridItemComponent<ImageExtra>}
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

function GridItem(
	props: PVGridItemProps<
		ImageExtra,
		{
			showDetailsOverlay: (item: ImageExtra, elem?: HTMLImageElement) => void
		}
	>,
) {
	const { value: item } = props

	const [isPreviewing, setIsPreviewing] = useState(false)

	if (item === undefined) return null
	if (item === null) return <Box bgColor={"fg.1/20"} width={"100%"} height={"100%"} />

	if (isPreviewing) return <GridItemAnim setIsPreviewing={setIsPreviewing} {...props} />

	const url = `dtm://dtproject/thumbhalf/${item.project_id}/${item.preview_id}`

	return (
		<Box bgColor={"fg.1/20"} onClick={() => setIsPreviewing(true)}>
			<div
				key={url}
				style={{
					width: "100%",
					height: "100%",
				}}
			>
				<img
					key={url}
					style={{
						width: "100%",
						height: "100%",
						objectFit: "cover",
						border: "1px solid #0000ff00",
						backgroundSize: "cover",
						backgroundPosition: "center",
					}}
					src={url}
					alt={item.prompt}
				/>
			</div>
		</Box>
	)
}

function GridItemAnim(
	props: PVGridItemProps<
		ImageExtra,
		{
			showDetailsOverlay: (item: ImageExtra, elem?: HTMLImageElement) => void
		}
	> & {
		setIsPreviewing: (value: boolean) => void
	},
) {
	const { value: item, showDetailsOverlay } = props
	const { setIsPreviewing } = props

	const imgRef = useRef<HTMLImageElement>(null)
	const box = useRef<[number, number]>([0, 0])

	const previewId = `${item?.project_id}/${item?.preview_id}`
	const url = `dtm://dtproject/thumbhalf/${previewId}`

	function downScale() {
		const w = box.current[0]
		const h = box.current[1]
		const scale = Math.min(w, h) / Math.max(w, h)
		return {
			scale: scale,
		}
	}

	const onceRef = useRef(false)
	useEffect(() => {
		if (onceRef.current) return
		if (!item) return
		showDetailsOverlay(item, imgRef.current ?? undefined)
		onceRef.current = true
	}, [item, showDetailsOverlay])

	return (
		<Box bgColor={"fg.1/20"}>
			<AnimatePresence>
				<motion.div
					key={url}
					layout
					layoutId={`${item?.project_id}_${item?.node_id}`}
					style={{
						width: "100%",
						height: "100%",
					}}
					transition={{ duration: 0.25 }}
					onLayoutAnimationComplete={() => {
						setIsPreviewing(false)
					}}
				>
					<motion.img
						key={url}
						ref={imgRef}
						style={{
							width: "100%",
							height: "100%",
							objectFit: "cover",
							border: "1px solid #0000ff00",
							backgroundSize: "cover",
							backgroundPosition: "center",
						}}
						variants={{
							downscale: () => downScale(),
						}}
						initial="downscale"
						animate={{ scale: 1 }}
						exit="downscale"
						src={url}
						alt={item?.prompt}
						transition={{ duration: 0.25 }}
					/>
				</motion.div>
			</AnimatePresence>
		</Box>
	)
}

export default ImagesList
