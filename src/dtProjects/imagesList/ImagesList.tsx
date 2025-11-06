import { Panel, VirtualizedList } from "@/components"
import ImagesListItem from "./ImageListItem"
import { useSnapshot } from "valtio"
import DTProjectsStore, { selectItem } from "../state/projectsStoreX"

interface ImagesList extends ChakraProps {}

function ImagesList(props: ImagesList) {
	const { ...rest } = props
	const snap = useSnapshot(DTProjectsStore.state)

	return (
		<Panel mr={1} mb={1} mt={0} ml={1} overflow={"clip"} flex={"1 1 auto"} bgColor={"bg.2"} {...rest}>
			<VirtualizedList
				itemComponent={ImagesListItem}
				items={snap.items}
				itemProps={{ snap, onSelect: selectItem }}
			/>
		</Panel>
	)
}

export default ImagesList