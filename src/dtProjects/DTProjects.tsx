import { Box, Button, HStack, Input, Progress, Spacer, VStack } from "@chakra-ui/react"
import { useEffect, useState } from "react"
import { GoGear } from "react-icons/go"
import type { IconType } from "react-icons/lib"
import { MdImageSearch } from "react-icons/md"
import { PiCoffee } from "react-icons/pi"
import { useDynamicRowHeight } from "react-window"
import { useSnapshot } from "valtio"
import { MotionBox, Panel } from "@/components/common"
import AppState from "@/hooks/appState"
import { LayoutRoot } from "@/metadata/Containers"
import TabContent from "@/metadata/infoPanel/TabContent"
import Tabs from "@/metadata/infoPanel/tabs"
import { capitalize } from "@/utils/helpers"
import ImagesList from "./imagesList/ImagesList"
import DTProjects from "./state/projectStore"
import { addDefaultWatchFolder } from "./state/watchFolders"
import ControlPane from "./controlPane/ControlPane"
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
		<LayoutRoot>
			{/* <Button onClick={async () => await loadTest()}>Click me</Button> */}
			<ControlPane />
			<ImagesList />
		</LayoutRoot>
	)
}

export default ProjectData
