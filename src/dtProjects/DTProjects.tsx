import { Box, Button, HStack, Image, Input, Progress, Spacer, VStack } from "@chakra-ui/react"
import { useEffect } from "react"
import { List, type RowComponentProps, useDynamicRowHeight } from "react-window"
import { useSnapshot } from "valtio"
import { Panel } from "@/components/common"
import MeasureGrid from "@/components/measureGrid/MeasureGrid"
import { CheckRoot } from "@/metadata/Containers"
import DataItem from "@/metadata/infoPanel/DataItem"
import DTProjectsStore, {
	addProject,
	loadProjects,
	type ProjectDataStateType,
	removeProject,
	scanAllProjects,
	search,
	selectItem,
	selectProject
} from "./state/projectsStore"

function ProjectData(props) {
	const snap = useSnapshot(DTProjectsStore.state)

	useEffect(() => {
		loadProjects()
		DTProjectsStore.listenToScanProgress();
		
		return () => DTProjectsStore.unlistenToScanProgress()
	}, [])

	const rowHeight = useDynamicRowHeight({
		defaultRowHeight: 50,
	})

	async function handleSelect(index: number) {
		selectItem(index)
	}



	return (
		<CheckRoot width={"full"} height={"full"} padding={4} overflow={"clip"}>
			<Panel
				gap={2}
				display={"flex"}
				flexDir={"row"}
				width={"full"}
				height={"full"}
				padding={4}
				overflow={"clip"}
				bgColor={"bg.2"}
				alignItems={"stretch"}
			>
				{/* <Button onClick={async () => await loadTest()}>Click me</Button> */}
				<Box flex={"0 0 20rem"} bgColor={"bg.3"} paddingY={1} paddingX={2} borderRadius={"md"}>
					<VStack alignItems={"stretch"} height={"100%"}>
						<HStack flex={"0 0 min-content"}>
							<Box fontSize={"md"} fontWeight={"bold"} flex={"1 1 auto"}>
								Projects
							</Box>
							<Button variant={"ghost"} size={"xs"} onClick={async () => await addProject()}>
								Add project
							</Button>
							<Button variant={"ghost"} size={"xs"} onClick={async () => await addProject(true)}>
								Add folder
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
										key={project.project_id as number}
										bgColor={
											snap.selectedProject?.project_id === project.project_id ? "bg.1" : "bg.1/50"
										}
										borderRadius={"md"}
										px={2}
										_hover={{ bgColor: "bg.1" }}
										onClick={async () => {
											selectProject({ project_id: project.project_id })
										}}
									>
										{/* <Box fontSize={"xs"}>{project.project_id as number}</Box> */}
										<Box fontSize={"sm"} flex={"1 1 auto"}>
											{(project.path as string).split("/").pop()}
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
							<Button flex={"0 0 min-content"} onClick={async () => await search(snap.searchInput)}>
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
				</Box>
				<Box
					key={snap.selectedProject?.project_id}
					overflow={"clip"}
					flex={"1 1 auto"}
					bgColor={"bg.1"}
					asChild
				>
					<List
						rowComponent={Row}
						rowCount={snap.items.length}
						rowHeight={rowHeight}
						rowProps={{ snap, onSelect: (index) => handleSelect(index) }}
					/>
				</Box>
			</Panel>
		</CheckRoot>
	)
}

type RowProps = {
	snap: ReadonlyState<ProjectDataStateType>
	onSelect: (index: number) => void
}
function Row(props: RowComponentProps<RowProps>) {
	const { index, snap, style, onSelect } = props
	const item = snap.items[index]
	const expanded = snap.expandedItems[index]

	const itemProps = {
		boxShadow: "sm",
		borderRadius: "md",
		padding: 1,
		_hover: { bgColor: "bg.0" },
		...style,
	}

	const details = expanded ? (snap.itemDetails[index] ?? null) : undefined

	const row = (
		<VStack key={item.row_id} width={"100%"} {...itemProps}>
			<HStack
				width={"100%"}
				alignItems={"flex-start"}
				// bgColor={"bg.2"}
				gap={2}
				onClick={() => onSelect(index)}
			>
				<Box position={"relative"} flex={"0 0 auto"}>
					<Image
						src={`dtm://dtproject/thumbhalf/${item.project_id}/${item.dt_id}`}
						alt={item.prompt}
						width={"8rem"}
						height={"8rem"}
						objectFit={"contain"}
					/>
					<Box position={"absolute"} bottom={1} right={1}>
						{index}
					</Box>
				</Box>
				<VStack alignItems={"stretch"} height={"8rem"}>
					<Box
						fontSize={"xs"}
						color={"fg.1"}
						flex={"1 1 auto"}
						overflow={"clip"}
						textOverflow={"ellipsis"}
					>
						{item.prompt}
					</Box>
					<Box
						fontSize={"xs"}
						color={"fg.2"}
						fontStyle={"italic"}
						flex={"0 1 auto"}
						overflow={"clip"}
						textOverflow={"ellipsis"}
					>
						{item.negative_prompt}
					</Box>
					<Box fontSize={"xs"} flex={"0 0 auto"}>
						Model: {item.model_file}
					</Box>
				</VStack>
				{/* <Box bgColor={"bg.2"}>{item.image_id}</Box> */}
			</HStack>
			{expanded && details === null && <Box>Loading...</Box>}
			{expanded && details !== null && (
				<MeasureGrid columns={2} maxItemLines={4} padding={2}>
					{Object.entries(details).map(([k, v]) => (
						<DataItem key={k} label={k} data={v} />
					))}
				</MeasureGrid>
			)}
		</VStack>
	)

	return row
}

export default ProjectData
