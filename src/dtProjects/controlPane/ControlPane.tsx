import { Box } from "@chakra-ui/react"
import { GoGear } from "react-icons/go"
import { MdImageSearch } from "react-icons/md"
import { PiCoffee } from "react-icons/pi"
import { useSnapshot } from "valtio"
import { Panel } from "@/components"
import AppState from "@/hooks/appState"
import Tabs from "@/metadata/infoPanel/tabs"
import { useUiState } from "@/metadata/state/uiState"
import { capitalize } from "@/utils/helpers"
import ProjectsPanel from "./ProjectsPanel"
import SearchPanel from "./SearchPanel"
import SettingsPanel from "./SettingsPanel"

interface ControlPane extends ChakraProps {}

function ControlPane(props: ControlPane) {
	const { ...restProps } = props
	const { uiSnap, uiState } = useUiState()
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
			{...restProps}
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
