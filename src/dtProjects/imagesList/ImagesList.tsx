import { Panel, VirtualizedList } from "@/components"
import ImagesListItem from "./ImageListItem"
import { useSnapshot } from "valtio"
import DTProjects, { useDTProjects } from "../state/projectStore"

interface ImagesList extends ChakraProps {}

function ImagesList(props: ImagesList) {
	const { ...rest } = props
	const { snap } = useDTProjects()

	console.log(snap)
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
			<VirtualizedList
				key={JSON.stringify(snap.imageSource)}
				itemComponent={ImagesListItem}
				initialRenderCount={50}
				items={snap.items}
				itemProps={{ snap, onSelect: () => {} }}
			/>
		</Panel>
	)
}

export default ImagesList
