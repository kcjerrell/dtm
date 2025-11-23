import { Box, Image } from "@chakra-ui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { type ImageExtra, pdb } from "@/commands"
import { Panel } from "@/components"
import PVGrid from "@/components/virtualizedList/PVGrid"
import type { PVListItemComponent } from "@/components/virtualizedList/PVLIst"
import { getRequestOpts, useDTProjects } from "../state/projectStore"
import { AnimatePresence, motion } from "motion/react"

interface ImagesList extends ChakraProps {}

function ImagesList(props: ImagesList) {
	const { ...rest } = props
	const { snap, state, store: dtp } = useDTProjects()
	const [totalCount, setTotalCount] = useState(0)

	useEffect(() => {
		if (!state.imageSource) return
		const opts = getRequestOpts(state.imageSource)
		pdb.listImages({ ...opts, take: 0, skip: 0 }).then((res) => {
			setTotalCount(res.total)
		})
	}, [state.imageSource])

	const getItems = useCallback(
		async (skip: number, take: number) => {
			if (!state.imageSource) return []
			const opts = getRequestOpts(state.imageSource)
			const res = await pdb.listImages({ ...opts, take, skip })
			return res.items
		},
		[state.imageSource],
	)

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
				key={JSON.stringify(snap.imageSource)}
				itemComponent={GridItem as PVListItemComponent<ImageExtra>}
				maxItemSize={snap.itemSize}
				itemProps={{
					snap,
					showDetailsOverlay: (item, elem) => dtp.showDetailsOverlay(item, elem),
				}}
				pageSize={250}
				totalCount={totalCount}
				getItems={getItems}
				keyFn={(item) => `${item.project_id}_${item.node_id}`}
			/>
		</Panel>
	)
}

function GridItem(props) {
	const { value: item, itemProps } = props
	const { showDetailsOverlay, snap } = itemProps

	const imgRef = useRef<HTMLImageElement>(null)
	const [isLoaded, setIsLoaded] = useState(false)

	if (item === undefined) return null
	if (item === null) return <Box bgColor={"fg.1/20"} width={"100%"} height={"100%"} />

	const isPreviewing =
		item.project_id === snap?.detailsOverlay?.item?.project_id &&
		item.node_id === snap?.detailsOverlay?.item?.node_id

	return (
		<Box bgColor={"fg.1/20"} onClick={() => showDetailsOverlay(item, imgRef.current)}>
				{!isPreviewing && (
					<motion.img
						// visibility={imgRef.current === snap?.detailsOverlay?.sourceElement ? "hidden" : "visible"}
						ref={(e) => {
							imgRef.current = e
							// if (e) e.addEventListener("load", () => setIsLoaded(true))
						}}
						style={{
							width: "100%",
							height: "100%",
							objectFit: "cover",
							border: "1px solid #0000ff00",
						}}
						src={`dtm://dtproject/thumbhalf/${item.project_id}/${item.preview_id}`}
						alt={item.prompt}
						transition={{ duration: 2 }}
						// initial={{ opacity: 0 }}
						// animate={{
						// opacity: isLoaded ? 1 : 0,
						// }}
						// transition={{
						// duration: 0.1,
						// }}
						// onClick={(e) => {
						// 	if (expanded) e.stopPropagation()
						// 	if (details?.tensor_id)
						// 		showPreview(
						// 			e.currentTarget,
						// 			`dtm://dtproject/tensor/${item.project_id}/${details.tensor_id}`,
						// 		)
						// }}
					/>
				)}
		</Box>
	)
}

export default ImagesList
