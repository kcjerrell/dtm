import { Box, Button, HStack, Input, Progress, Spacer, VStack } from "@chakra-ui/react"
import { GoGear } from "react-icons/go"
import { MdImageSearch } from "react-icons/md"
import { PiCoffee } from "react-icons/pi"
import { Panel } from "@/components"
import TabContent from "@/metadata/infoPanel/TabContent"
import { capitalize } from "@/utils/helpers"
import DTProjects from "../DTProjects"
import { addDefaultWatchFolder } from "../state/watchFolders"
import { useUiState } from "@/metadata/state/uiState"
import { useSnapshot } from "valtio"
import AppState from "@/hooks/appState"
import { useDTProjects } from "../state/projectStore"
import SettingsPanel from "./SettingsPanel"
import Tabs from "@/metadata/infoPanel/tabs"
import SearchPanel from "./SearchPanel"
import ProjectsPanel from "./ProjectsPanel"

interface ControlPane extends ChakraProps {}

function ControlPane(props: ControlPane) {
	const { ...restProps } = props
	const { uiSnap, uiState } = useUiState()
	const { snap } = useDTProjects()
	const { isSidebarVisible } = useSnapshot(AppState.store)

	return (
		<Panel
			flex={"0 0 20rem"}
			paddingY={1}
			paddingX={2}
			borderRadius={"md"}
			bgColor={"bg.2"}
			mr={1}
			mb={1}
			mt={0}
			ml={1}
		>
			<Tabs.Root
				lazyMount
				unmountOnExit
				height={"100%"}
				value={uiSnap.selectedTab}
				onValueChange={(e) => {
					uiState.selectedTab = e.value
				}}
			>
				<Tabs.List paddingLeft={isSidebarVisible ? 0 : "50px"}>
					{(
						[
							["search", MdImageSearch],
							["projects", PiCoffee],
							["settings", GoGear],
						] as const
					).map(([tab, Icon]) => (
						<Tabs.Trigger key={tab} value={tab} paddingBlock={0.5} height={"2rem"}>
							<Icon style={{ width: "1.25rem", height: "1.25rem" }} />
							<Box
								width={isSidebarVisible || tab === uiSnap.selectedTab ? "auto" : 0}
								overflow={"hidden"}
								whiteSpace={"nowrap"}
							>
								{capitalize(tab)}
							</Box>
						</Tabs.Trigger>
					))}
					<Tabs.Indicator />
				</Tabs.List>
				<SearchPanel />
				<ProjectsPanel />
				<SettingsPanel />
			</Tabs.Root>
		</Panel>
	)
}

export default ControlPane
