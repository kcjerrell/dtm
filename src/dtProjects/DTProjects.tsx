import { LayoutRoot } from "@/metadata/Containers"
import { useEffect, useState } from "react"
import { useSnapshot } from "valtio"
import ControlPane from "./controlPane/ControlPane"
import ImagesList from "./imagesList/ImagesList"
import DTProjects from "./state/projectStore"
import DetailsOverlay from './detailsOverlay/DetailsOverlay'
// import DTProjects, {
// 	addProject,
// 	loadProjects,
// 	removeProject,
// 	scanAllProjects,
// 	search,
// 	selectItem,
// 	selectProject
// } from "./state/projectsStoreX"

function ProjectData(props) {
	const snap = useSnapshot(DTProjects.state)

	const [selectedTab, setSelectedTab] = useState("Search")

	useEffect(() => {
		DTProjects.init()
		return () => DTProjects.removeListeners()
	}, [])

	return (
		<LayoutRoot position={"relative"}>
			{/* <Button onClick={async () => await loadTest()}>Click me</Button> */}
			<ControlPane />
			<ImagesList />
			<DetailsOverlay />
		</LayoutRoot>
	)
}

export default ProjectData
