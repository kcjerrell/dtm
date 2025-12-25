import { Box } from "@chakra-ui/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { Snapshot } from "valtio"
import { type ImageExtra, pdb } from "@/commands"
import { Panel } from "@/components"
import PVGrid from "@/components/virtualizedList/PVGrid2"
import type { PVListItemComponent } from "@/components/virtualizedList/PVLIst"
import { useDTP } from "../state/context"
import type { UIControllerState } from "../state/uiState"
import StatusBar from "./StatusBar"

interface ImagesList extends ChakraProps {}

function ImagesList(props: ImagesList) {
	const { ...rest } = props

	const { images, uiState } = useDTP()
	const uiSnap = uiState.useSnap()
	const imagesSnap = images.useSnap()

	// useEffect(() => {
	// 	if (!images.state.imageSource) return
	// 	pdb.listImages({ ...images.state.imageSource }, 0, 0).then((res) => {
	// 		setTotalCount(res.total)
	// 	})
	// }, [images.state.imageSource])

	// useEffect(() => {
	// 	const unsubscribe = subscribe(images.state.selectedProjects, () => {
	// 		console.log(
	// 			"sub",
	// 			state.selectedProjects,
	// 			va.sum(state.selectedProjects, (p) => state.imageSourceCounts?.[p.id] ?? 0),
	// 		)
	// 		if (state.selectedProjects.length)
	// 			setTotalCount(va.sum(state.selectedProjects, (p) => state.imageSourceCounts?.[p.id] ?? 0))
	// 		else setTotalCount(0)
	// 	})
	// 	return () => unsubscribe()
	// }, [state])

	const query = JSON.stringify(imagesSnap.imageSource)

	const getItems = useCallback(
		async (skip: number, take: number) => {
			const res = await pdb.listImages(JSON.parse(query), skip, take)
			return res.items
		},
		[query],
	)

	const getCount = useCallback(async () => {
		const res = await pdb.listImages(JSON.parse(query), 0, 0)
		return res.total
	}, [query])

	useEffect(() => {
		console.log(query, "Changed")
	}, [query])

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
				bgColor={"transparent"}
				minHeight={"100%"}
				key={imagesSnap.searchId}
				itemComponent={GridItem as PVListItemComponent<ImageExtra>}
				getItems={getItems}
				getCount={getCount}
				maxItemSize={imagesSnap.imageSize ?? 5}
				onImagesChanged={images.onImagesChanged}
				gap={2}
				itemProps={{
					snap: uiSnap,
					showDetailsOverlay: (item: ImageExtra, elem?: HTMLImageElement) => {
						uiState.showDetailsOverlay(item, elem)
					},
				}}
				keyFn={(item) => `${item.project_id}_${item.node_id}`}
			/>
			{/* <SearchIndicators position={"absolute"} top={0} left={2} right={2}/> */}
		</Panel>
	)
}

function GridItem(
	props: PVGridItemProps<
		ImageExtra,
		{
			showDetailsOverlay: (item: ImageExtra, elem?: HTMLImageElement) => void
			snap: Snapshot<UIControllerState>
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
			snap: Snapshot<UIControllerState>
		}
	> & {
		setIsPreviewing: (value: boolean) => void
	},
) {
	const { value: item, itemProps } = props
	const { showDetailsOverlay, snap } = itemProps
	const { setIsPreviewing } = props

	const imgRef = useRef<HTMLImageElement>(null)
	const box = useRef<[number, number]>([0, 0])

	const url = `dtm://dtproject/thumbhalf/${item?.project_id}/${item?.preview_id}`

	const isPreviewing =
		item?.project_id === snap.detailsView?.item?.project_id &&
		item?.node_id === snap.detailsView?.item?.node_id

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
				{!isPreviewing && (
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
				)}
			</AnimatePresence>
		</Box>
	)
}

export default ImagesList
