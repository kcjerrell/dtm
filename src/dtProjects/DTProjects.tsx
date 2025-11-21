import { useEffect } from "react"
import { LayoutRoot } from "@/metadata/Containers"
import ControlPane from "./controlPane/ControlPane"
import DetailsOverlay from "./detailsOverlay/DetailsOverlay"
import ImagesList from "./imagesList/ImagesList"
import { DTProjects } from "./state/projectStore"
import { useSnapshot } from "valtio"
import { Panel } from "@/components"

function ProjectData(props: ChakraProps) {
	const { ...restProps } = props

	const { store } = DTProjects
	const snap = useSnapshot(store.state)

	useEffect(() => {
		store.init()
		return () => store.removeListeners()
	}, [store.init, store.removeListeners])

	return (
		<LayoutRoot position={"relative"} {...restProps}>
			<ControlPane margin={2} />

			{snap.imageSource ? (
				<ImagesList margin={2} marginLeft={0} />
			) : (
				<Panel
					position="relative"
					margin={2}
					marginLeft={0}
					p={0.5}
					overflow={"clip"}
					flex={"1 1 auto"}
					bgColor={"bg.2"}
				></Panel>
			)}

			<DetailsOverlay />
		</LayoutRoot>
	)
}

export default ProjectData
