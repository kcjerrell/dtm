import { Panel, VirtualizedList } from "@/components"
import ImagesListItem from "./ImageListItem"
import { useSnapshot } from "valtio"
import DTProjects, { getRequestOpts, selectItem, useDTProjects } from "../state/projectStore"
import PVList, { PVListItemComponent } from "@/components/virtualizedList/PVLIst"
import { ImageExtra, projectsDb } from "@/commands"
import { useCallback, useEffect, useMemo, useState } from "react"

interface ImagesList extends ChakraProps {}

function ImagesList(props: ImagesList) {
	const { ...rest } = props
	const { snap, state } = useDTProjects()
	const [totalCount, setTotalCount] = useState(0)

	useEffect(() => {
		if (!state.imageSource) return
		const opts = getRequestOpts(state.imageSource)
		projectsDb.listImages({ ...opts, take: 0, skip: 0 }).then((res) => {
			setTotalCount(res.total)
		})
	}, [state.imageSource])

	const getItems = useCallback(
		async (skip, take) => {
			if (!state.imageSource) return []
			const opts = getRequestOpts(snap.imageSource)
			const res = await projectsDb.listImages({ ...opts, take, skip })
			return res.items
		},
		[snap.imageSource],
	)

	return (
		<Panel
			mr={1}
			mb={1}
			mt={0}
			ml={1}
			overflow={"clip"}
			flex={"1 1 auto"}
			bgColor={"bg.2"}
			{...rest}
		>
			<PVList<ImageExtra>
				key={JSON.stringify(snap.imageSource)}
				itemComponent={ImagesListItem as PVListItemComponent<ImageExtra>}
				initialRenderCount={50}
				itemProps={{
					snap
				}}
				pageSize={250}
				totalCount={totalCount}
				getItems={getItems}
				keyFn={(item) => `${item.project_id}_${item.row_id}`}
			/>
		</Panel>
	)
}

export default ImagesList
