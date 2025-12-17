import { Box } from "@chakra-ui/react"
import { motion } from "motion/react"
import { useCallback, useRef } from "react"
import type { Snapshot } from "valtio"
import { type ImageExtra, pdb } from "@/commands"
import { Panel } from "@/components"
import PVGrid, { type PVGridItemProps } from "@/components/virtualizedList/PVGrid2"
import type { PVListItemComponent } from "@/components/virtualizedList/PVLIst"
import SearchIndicator from "../SearchIndicator"
import { useDTP } from "../state/context"
import type { ImagesControllerState } from "../state/images"
import { UIControllerState } from "../state/uiState"

interface ImagesList extends ChakraProps {}

function ImagesList(props: ImagesList) {
	const { ...rest } = props

	const { images, uiState } = useDTP()
	const uiSnap = uiState.useSnap()
	const imagesSnap = images.useSnap()
	const itemSource = images.useItemSource()

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

	return (
		<Panel
			position="relative"
			margin={2}
			p={0.5}
			// overflow={"clip"}
			flex={"1 1 auto"}
			bgColor={"bg.2"}
			{...rest}
		>
			<PVGrid<ImageExtra>
				key={imagesSnap.searchId}
				itemComponent={GridItem as PVListItemComponent<ImageExtra>}
				itemSource={itemSource}
				maxItemSize={imagesSnap.imageSize ?? 200}
				itemProps={{
					snap: uiSnap,
					showDetailsOverlay: (item: ImageExtra, elem?: HTMLImageElement) => {
						uiState.showDetailsOverlay(item, elem)
					},
					// dtp.showDetailsOverlay(item, elem),
				}}
				keyFn={(item) => `${item.project_id}_${item.node_id}`}
			/>
			<SearchIndicator position={"absolute"} top={2} left={2} />
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
	const { value: item, itemProps } = props
	const { showDetailsOverlay, snap } = itemProps

	const imgRef = useRef<HTMLImageElement>(null)
	// const [isLoaded, setIsLoaded] = useState(false)

	if (item === undefined) return null
	if (item === null) return <Box bgColor={"fg.1/20"} width={"100%"} height={"100%"} />

	const isPreviewing =
		item.project_id === snap.detailsView?.item?.project_id &&
		item.node_id === snap.detailsView?.item?.node_id

	return (
		<Box bgColor={"fg.1/20"} onClick={() => showDetailsOverlay(item, imgRef.current ?? undefined)}>
			{/* {!isPreviewing && ( */}
			<motion.img
				// visibility={imgRef.current === snap?.detailsOverlay?.sourceElement ? "hidden" : "visible"}
				animate={{ visibility: isPreviewing ? "hidden" : "visible" }}
				transition={{ duration: 0, delay: isPreviewing ? 0 : 0.2 }}
				ref={(e) => {
					imgRef.current = e
					// if (e) e.addEventListener("load", () => setIsLoaded(true))
				}}
				style={{
					width: "100%",
					height: "100%",
					objectFit: "cover",
					border: "1px solid #0000ff00",
					backgroundColor: "#77777777",
				}}
				src={`dtm://dtproject/thumbhalf/${item.project_id}/${item.preview_id}`}
				alt={item.prompt}
				// initial={{ opacity: 0 }}
				// animate={{
				// opacity: isLoaded ? 1 : 0,
				// }}
				// transition={{
				// duration: 0.1,
				// }}
			/>
			{/* )} */}
		</Box>
	)
}

export default ImagesList
