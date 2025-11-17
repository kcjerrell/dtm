import { Box, Image } from "@chakra-ui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { type ImageExtra, pdb } from "@/commands"
import { Panel } from "@/components"
import PVGrid from "@/components/virtualizedList/PVGrid"
import type { PVListItemComponent } from "@/components/virtualizedList/PVLIst"
import { getRequestOpts, useDTProjects } from "../state/projectStore"

interface ImagesList extends ChakraProps {}

function ImagesList(props: ImagesList) {
	const { ...rest } = props
	const { snap, state, showDetailsOverlay } = useDTProjects()
	const [totalCount, setTotalCount] = useState(0)

	useEffect(() => {
		if (!state.imageSource) return
		const opts = getRequestOpts(state.imageSource)
		pdb.listImages({ ...opts, take: 0, skip: 0 }).then((res) => {
			setTotalCount(res.total)
		})
	}, [state.imageSource])

	const getItems = useCallback(
		async (skip, take) => {
			if (!state.imageSource) return []
			const opts = getRequestOpts(snap.imageSource)
			const res = await pdb.listImages({ ...opts, take, skip })
			return res.items
		},
		[snap.imageSource, state.imageSource],
	)

	return (
		<Panel
			mr={1}
			mb={1}
			mt={0}
			ml={1}
			p={0.5}
			overflow={"clip"}
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
					showDetailsOverlay,
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

	if (!item) return null

	const isPreviewing =
		item.project_id === snap?.detailsOverlay?.item?.project_id &&
		item.node_id === snap?.detailsOverlay?.item?.node_id

	return (
		<Box padding={0.5} onClick={() => showDetailsOverlay(item, imgRef.current)}>
			{!isPreviewing && (
				<Image
					// visibility={imgRef.current === snap?.detailsOverlay?.sourceElement ? "hidden" : "visible"}
					ref={imgRef}
					width={"100%"}
					height={"100%"}
					src={`dtm://dtproject/thumbhalf/${item.project_id}/${item.preview_id}`}
					alt={item.prompt}
					// width={"8rem"}
					// height={"8rem"}
					objectFit={"cover"}
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
