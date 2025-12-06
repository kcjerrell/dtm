import { FormatByte, Text } from "@chakra-ui/react"
import { useEffect } from "react"
import { useSnapshot } from "valtio"
import { Panel } from "@/components"
import { LayoutRoot } from "@/metadata/Containers"
import { useUiState } from "@/metadata/state/uiState"
import ControlPane from "./controlPane/ControlPane"
import DetailsOverlay from "./detailsOverlay/DetailsOverlay"
import ImagesList from "./imagesList/ImagesList"
import { DTProjects, useProjectsSummary } from "./state/projectStore"

function ProjectData(props: ChakraProps) {
	const { ...restProps } = props

	const { store } = DTProjects
	const snap = useSnapshot(store.state)
	const { uiSnap } = useUiState()
	const summary = useProjectsSummary()

	useEffect(() => {
		store.init()
		return () => store.removeListeners()
	}, [store.init, store.removeListeners])

	return (
		<LayoutRoot position={"relative"} {...restProps}>
			<ControlPane margin={2} />

			{uiSnap.selectedTab !== "settings" && snap.imageSource ? (
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
					alignItems={"center"}
					justifyContent={"center"}
					fontSize={'lg'}
					color={"fg.1/70"}
					fontWeight={'600'}
				>
					<Text>{summary.totalProjects} projects found</Text>
					<Text>{summary.totalImages} images found</Text>
					<Text><FormatByte value={summary.totalSize} /></Text>
				</Panel>
			)}

			<DetailsOverlay />
		</LayoutRoot>
	)
}

export default ProjectData
