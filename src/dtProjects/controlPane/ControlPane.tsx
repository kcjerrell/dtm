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

const tabs = [
	{
		label: "Search",
		value: "search",
		Icon: MdImageSearch,
		component: SearchPanel,
	},
	{
		label: "Projects",
		value: "projects",
		Icon: PiCoffee,
		component: ProjectsPanel,
	},
	{
		label: "Settings",
		value: "settings",
		Icon: GoGear,
		component: SettingsPanel,
	},
]

interface ControlPane extends ChakraProps {}

function ControlPane(props: ControlPane) {
	const { ...restProps } = props
	const { uiSnap, uiState } = useUiState()
	const { isSidebarVisible } = useSnapshot(AppState.store)

	return (
		<Panel
			flex={"0 0 20rem"}
			width={"20rem"}
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
				<TabList paddingLeft={isSidebarVisible ? 0 : "50px"} />
				<SearchPanel />
				<ProjectsPanel />
				<SettingsPanel />
			</Tabs.Root>
		</Panel>
	)
}

function TabList(props: ChakraProps) {
	return (
		<Tabs.List {...props}>
			{tabs.map(({ value, Icon, label }) => (
				<Tabs.Trigger key={value} value={value} paddingBlock={0.5} height={"2rem"}>
					<Icon style={{ width: "1.25rem", height: "1.25rem" }} />
					<Box>{label}</Box>
				</Tabs.Trigger>
			))}
			<Tabs.Indicator />
		</Tabs.List>
	)
}

export default ControlPane
