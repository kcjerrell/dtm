import { useEffect } from "react"
import { LayoutRoot } from "@/metadata/Containers"
import ControlPane from "./controlPane/ControlPane"
import DetailsOverlay from "./detailsOverlay/DetailsOverlay"
import ImagesList from "./imagesList/ImagesList"
import { DTProjects } from "./state/projectStore"

function ProjectData(props: ChakraProps) {
	const { ...restProps } = props

	const { store } = DTProjects

	useEffect(() => {
		store.init()
		return () => store.removeListeners()
	}, [store.init, store.removeListeners])

	return (
		<LayoutRoot position={"relative"} {...restProps}>
			<ControlPane margin={2} />
			<ImagesList margin={2} marginLeft={0}/>
			<DetailsOverlay />
		</LayoutRoot>
	)
}

export default ProjectData
