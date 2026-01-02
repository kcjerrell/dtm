import { Box } from "@chakra-ui/react"
import { GoGear } from "react-icons/go"
import { MdImageSearch } from "react-icons/md"
import { PiCoffee } from "react-icons/pi"
import { useSnapshot } from "valtio"
import { Panel } from "@/components"
import { useDTP } from "@/dtProjects/state/context"
import AppStore from "@/hooks/appState"
import Tabs from "@/metadata/infoPanel/tabs"
import ProjectsPanel from "./ProjectsPanel"
import SearchPanel from "./SearchPanel"
import SettingsPanel from "./SettingsPanel"

const tabs = [
	{
		label: "Search",
		value: "search",
		Icon: MdImageSearch,
		component: SearchPanel,
		requiresProjects: true,
	},
	{
		label: "Projects",
		value: "projects",
		Icon: PiCoffee,
		component: ProjectsPanel,
		requiresProjects: true,
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
	const { uiState } = useDTP()
	const uiSnap = uiState.useSnap()
	const { isSidebarVisible } = useSnapshot(AppStore.store)

	return (
		<Panel
			flex={"0 0 20rem"}
			width={"20rem"}
			paddingY={1}
			paddingX={1}
			borderRadius={"md"}
			bgColor={"bg.2"}
			margin={2}
			{...restProps}
		>
			<Tabs.Root
				lazyMount
				unmountOnExit
				height={"100%"}
				value={uiSnap.selectedTab}
				onValueChange={(e) => {
					uiState.setSelectedTab(e.value as typeof uiSnap.selectedTab)
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
	const { projects } = useDTP()
	const snap = projects.useSnap()

	const hasProjects = snap.projects.length > 0

	return (
		<Tabs.List {...props}>
			{tabs.map(({ value, Icon, label, requiresProjects }) => {
				if (requiresProjects && !hasProjects) return null
				return (
					<Tabs.Trigger key={value} value={value} paddingBlock={0.5} height={"2rem"}>
						<Icon style={{ width: "1.25rem", height: "1.25rem" }} />
						<Box>{label}</Box>
					</Tabs.Trigger>
				)
			})}
			<Tabs.Indicator />
		</Tabs.List>
	)
}

export default ControlPane
