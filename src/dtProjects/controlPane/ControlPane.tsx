import { Box } from "@chakra-ui/react"
import { IconButton, Panel } from "@/components"
import { GoGear, MdImageSearch, PiCoffee } from "@/components/icons/icons"
import { useDTP } from "@/dtProjects/state/context"
import Tabs from "@/metadata/infoPanel/tabs"
import ProjectsPanel from "./ProjectsPanel"
import SearchPanel from "./SearchPanel"

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
]

interface ControlPane extends ChakraProps {}

function ControlPane(props: ControlPane) {
    const { ...restProps } = props
    const { uiState } = useDTP()
    const uiSnap = uiState.useSnap()

    return (
        <Panel
            flex={"0 0 18rem"}
            width={"16rem"}
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
                <TabList justifyContent={"flex-end"} />
                <SearchPanel />
                <ProjectsPanel />
            </Tabs.Root>
        </Panel>
    )
}

function TabList(props: ChakraProps) {
    const { projects, uiState } = useDTP()
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
            <IconButton onClick={() => uiState.showSettings()}>
                <GoGear />
            </IconButton>
        </Tabs.List>
    )
}

export default ControlPane
