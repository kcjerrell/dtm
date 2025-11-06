import {
	Box,
	Button,
	HStack,
	Image,
	Input,
	Progress,
	Spacer,
	type StackProps,
	VStack,
} from "@chakra-ui/react"
import { useEffect, useState } from "react"
import { type RowComponentProps, useDynamicRowHeight } from "react-window"
import { useSnapshot } from "valtio"
import { MotionBox, Panel } from "@/components/common"
import MeasureGrid from "@/components/measureGrid/MeasureGrid"
import VirtualizedList, {
	type VirtualizedListItemProps,
} from "@/components/virtualizedList/VirtualizedList2"
import AppState from "@/hooks/appState"
import { LayoutRoot } from "@/metadata/Containers"
import DataItem from "@/metadata/infoPanel/DataItem"
import DTProjectsStore, {
	addProject,
	loadProjects,
	type ProjectDataStateType,
	removeProject,
	scanAllProjects,
	search,
	selectItem,
	selectProject,
} from "./state/projectsStoreX"
import { showPreview } from "@/components/preview"
import ImagesList from "./imagesList/ImagesList"
import { PiCoffee } from "react-icons/pi"
import { MdImageSearch } from "react-icons/md"
import { GoGear } from "react-icons/go"
import { IconType } from "react-icons/lib"
import Tabs from "@/metadata/infoPanel/tabs"
import { capitalize } from "@/utils/helpers"
import TabContent from "@/metadata/infoPanel/TabContent"

function ProjectData(props) {
	const snap = useSnapshot(DTProjectsStore.state)
	const { isSidebarVisible } = useSnapshot(AppState.store)

	const [selectedTab, setSelectedTab] = useState("Search")

	useEffect(() => {
		loadProjects()
		DTProjectsStore.attachListeners()

		return () => DTProjectsStore.removeListeners()
	}, [])

	const rowHeight = useDynamicRowHeight({
		defaultRowHeight: 100,
	})

	async function handleSelect(index: number) {
		selectItem(index)
	}

	return (
		<LayoutRoot>
			{/* <Button onClick={async () => await loadTest()}>Click me</Button> */}
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
					value={selectedTab}
					onValueChange={(e) => setSelectedTab(e.value)}
				>
					<Tabs.List paddingLeft={isSidebarVisible ? 0 : "50px"}>
						{(
							[
								["search", MdImageSearch],
								["projects", PiCoffee],
								["settings", GoGear],
							] as const
						).map(([tab, Icon]) => (
							<Tabs.Trigger key={tab} value={tab} paddingBlock={0.5} height={'2rem'}>
								<Icon style={{ width: "1.25rem", height: "1.25rem" }} />
								<Box
									width={isSidebarVisible || tab === selectedTab ? "auto" : 0}
									overflow={"hidden"}
									whiteSpace={"nowrap"}
								>
									{capitalize(tab)}
								</Box>
							</Tabs.Trigger>
						))}
										<Tabs.Indicator />
					</Tabs.List>
					
					<TabContent value={"search"}>search</TabContent>
					<TabContent value={"projects"}>
						<VStack alignItems={"stretch"} height={"100%"}>
							<HStack
								flex={"0 0 min-content"}
								paddingLeft={isSidebarVisible ? 0 : "50px"}
								transition={"all 0.2s ease"}
							>
								<Spacer />
								<Button variant={"ghost"} size={"xs"} onClick={async () => await addProject()}>
									+P
								</Button>
								<Button variant={"ghost"} size={"xs"} onClick={async () => await addProject(true)}>
									+F
								</Button>
							</HStack>
							<Box
								overflowY={"auto"}
								overflowX={"clip"}
								scrollbarGutter={"stable"}
								scrollbarWidth={"thin"}
								flex={"1 1 auto"}
							>
								<VStack alignItems={"stretch"} gap={1}>
									{snap.projects.map((project, i) => (
										<HStack
											tabIndex={0}
											key={project.project_id as number}
											// background={`linear-gradient(90deg, {${snap.selectedProject?.project_id === project.project_id ? "colors.info/50" : "colors.bg.1/50"}} ${project.scanProgress ?? 100}%, {colors.fg.2} ${project.scanProgress ?? 100}%)`}
											// bgColor={
											// 	snap.selectedProject?.project_id === project.project_id ? "bg.1" : "bg.1/50"
											// }
											borderRadius={"md"}
											border={"1px solid transparent"}
											borderColor={
												snap.selectedProject?.project_id === project.project_id ? "info" : "bg.1"
											}
											px={2}
											_hover={{ bgColor: "bg.1" }}
											onClick={async () => {
												selectProject({ project_id: project.project_id })
											}}
										>
											{/* <Box fontSize={"xs"}>{project.project_id as number}</Box> */}
											<Box fontSize={"sm"} flex={"1 1 auto"}>
												{(project.path as string).split("/").pop()?.slice(0, -8)}
											</Box>
											<Box fontSize={"sm"}>{project.image_count as number}</Box>
											<Button
												variant={"ghost"}
												padding={0}
												colorPalette={"red"}
												height={"min-content"}
												aspectRatio={1}
												size={"xs"}
												onClick={async () => await removeProject(project.path as string)}
											>
												X
											</Button>
										</HStack>
									))}
								</VStack>
							</Box>
							<Spacer />
							<HStack>
								<Input
									flex={"1 1 auto"}
									bgColor={"bg.0"}
									value={snap.searchInput}
									onChange={(e) => {
										DTProjectsStore.state.searchInput = e.target.value
									}}
								/>
								<Button
									flex={"0 0 min-content"}
									onClick={async () => await search(snap.searchInput)}
								>
									Search
								</Button>
							</HStack>

							{snap.scanProgress !== -1 && (
								<Progress.Root
									key={snap.scanningProject}
									value={snap.scanProgress}
									size={"md"}
									marginBottom={0}
									marginTop={"auto"}
									flex={"0 0 auto"}
								>
									<Progress.Track>
										<Progress.Range />
									</Progress.Track>
								</Progress.Root>
							)}
							<Button
								flex={"0 0 auto"}
								marginBottom={0}
								onClick={async () => await scanAllProjects()}
							>
								Scan all
							</Button>
						</VStack>
						)
					</TabContent>
					<TabContent value={"settings"}>settings</TabContent>
				</Tabs.Root>
			</Panel>
			<ImagesList />
		</LayoutRoot>
	)
}

type SidebarTabProps = {
	icon: IconType
	label: string
	showLabel?: boolean
}
function SidebarTab(props: SidebarTabProps) {
	const { icon: Icon, label, showLabel, ...rest } = props
	return (
		<HStack bgColor={"fg.2/20"} {...rest}>
			<MotionBox
				whiteSpace={"nowrap"}
				// display={showLabel ? "block" : "none"}
				textOverflow={"clip"}
				overflow={"hidden"}
				fontSize={"md"}
				fontWeight={"bold"}
				flex={"1 1 auto"}
				animate={{
					width: showLabel ? "auto" : 0,
				}}
				transition={{ duration: 0.1, delay: showLabel ? 0.2 : 0 }}
			>
				{label}
			</MotionBox>
			<Icon />
		</HStack>
	)
}

export default ProjectData
