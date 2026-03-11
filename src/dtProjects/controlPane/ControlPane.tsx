import { Box } from "@chakra-ui/react"
import { IconButton, Panel } from "@/components"
import { GoGear, MdImageSearch, PiCoffee } from "@/components/icons/icons"
import { useDTP } from "@/dtProjects/state/context"
import Tabs from "@/metadata/infoPanel/tabs"
import ProjectsPanel from "./projectsPanel/ProjectsPanel"
import SearchPanel from "./SearchPanel"

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
]

interface ControlPane extends ChakraProps {}

function ControlPane(props: ControlPane) {
    const { ...restProps } = props
    const { uiState } = useDTP()
    const uiSnap = uiState.useSnap()

    return (
        <Panel
            width={"full"}
            paddingY={0}
            paddingX={0}
            borderRadius={"md"}
            variant={"float"}
            bgColor={"grayc.16"}
            _dark={{
                bgColor: "grayc.16",
            }}
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
                aria-label="Projects tabs"
            >
                <TabList justifyContent={"flex-end"} />
                <SearchPanel id="projects-search-panel" aria-labelledby="projects-search-tab" />
                <ProjectsPanel
                    id="projects-projects-panel"
                    aria-labelledby="projects-projects-tab"
                />
            </Tabs.Root>
        </Panel>
    )
}

function TabList(props: ChakraProps) {
    const { uiState } = useDTP()

    return (
        <Tabs.List aria-label={"Projects tabs"} {...props}>
            {tabs.map(({ value, Icon, label }) => {
                return (
                    <Tabs.Trigger
                        key={value}
                        id={`projects-${value}-tab`}
                        aria-controls={`projects-${value}-panel`}
                        aria-label={`${label} tab`}
                        value={value}
                        padding={2}
                    >
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
