import { Box, chakra, HStack, Spinner, VStack } from "@chakra-ui/react"
import { AnimatePresence, motion } from "motion/react"
import type { ComponentProps } from "react"
import { FiCopy, FiSave } from "react-icons/fi"
import { PiListMagnifyingGlassBold } from "react-icons/pi"
import { dtProject, type ImageExtra } from "@/commands"
import urls from "@/commands/urls"
import { IconButton } from "@/components"
import { DarkMode } from "@/components/ui/color-mode"
import { sendToMetadata } from "@/metadata/state/interop"
import { useDTP } from "../state/context"
import DetailsContent from "./DetailsContent"
import DetailsImage from "./DetailsImage"
import TensorsList from "./TensorsList"

const transition = { duration: 0.25, ease: "easeInOut" }

interface DetailsOverlayProps extends ComponentProps<typeof Container> {}

function DetailsOverlay(props: DetailsOverlayProps) {
	const { ...rest } = props

	const { uiState } = useDTP()
	const snap = uiState.useDetailsOveralay()

	const { item, itemDetails } = snap

	const isVisible = !!item

	const srcHalf =
		item || snap.lastItem ? urls.thumbHalf(item ?? (snap.lastItem as ImageExtra)) : undefined
	const srcFull =
		item || snap.lastItem ? urls.thumb(item ?? (snap.lastItem as ImageExtra)) : undefined

	return (
		<Container
			onClick={() => {
				if (snap.subItem) uiState.hideSubItem()
				else uiState.hideDetailsOverlay()
			}}
			variants={{
				open: {
					opacity: 1,
					backgroundColor: "#00000099",
					backdropFilter: "blur(5px)",
					// display: "flex",
					visibility: 'visible',
					pointerEvents: 'auto',
					transition: {
						visibility: {
							duration: 0,
							delay: 0,
						},
						duration: transition.duration,
						ease: "easeOut",
					},
				},
				closed: {
					opacity: 1,
					backgroundColor: "#00000000",
					backdropFilter: "blur(0px)",
					// visibility: "hidden",
					visibility: 'hidden',
					pointerEvents: 'none',
					transition: {
						visibility: {
							duration: 0,
							delay: transition.duration,
						},
						duration: transition.duration,
						ease: "easeOut",
					},
				},
			}}
			initial={"closed"}
			exit={"closed"}
			animate={isVisible ? "open" : "closed"}
			transition={{ duration: transition.duration }}
			{...rest}
		>
			<VStack
				padding={4}
				paddingBottom={0}
				gap={0}
				minHeight={0}
				width={"100%"}
				height={"100%"}
				overflowY={"clip"}
				alignItems={"stretch"}
			>
				<Box width={"100%"} minHeight={0} flex={"1 1 auto"} position={"relative"}>
					<DetailsImage
						inset={0}
						src={srcFull}
						srcHalf={srcHalf}
						sourceRect={snap.sourceRect ?? null}
						naturalSize={{ width: snap.width ?? 1, height: snap.height ?? 1 }}
						position={"absolute"}
						zIndex={0}
						// filter={subItem ? "blur(2px)" : "none"}
						imgStyle={{
							filter: snap.subItem ? "brightness(0.5)" : "none",
							transition: "filter 0.3s ease",
						}}
						transition={"filter 0.3s ease"}
					/>
					<AnimatePresence initial={false} mode={"sync"}>
						{snap.subItem?.isLoading && (
							<Spinner
								color={"white"}
								bgColor={"black"}
								padding={1}
								left="50%"
								top="50%"
								position="absolute"
								transform="translate(-50%, -50%)"
								zIndex={30}
							/>
						)}
						{snap.subItem && (
							<VStack
								height={"100%"}
								width={"100%"}
								alignItems={"center"}
								padding={1}
								zIndex={1}
								key={snap.subItem?.tensorId}
								position={"absolute"}
							>
								<DetailsImage
									pixelated={snap.subItem?.tensorId?.startsWith("color")}
									width={"100%"}
									flex={"1 1 auto"}
									src={snap.subItem?.url}
									// srcHalf={subItem?.thumbUrl}
									sourceRect={() => snap.subItemSourceRect}
									sourceElement={snap.subItem.sourceElement as HTMLElement}
									naturalSize={{
										width: snap.subItem?.width ?? 1,
										height: snap.subItem?.height ?? 1,
									}}
									zIndex={1}
									imgStyle={{ boxShadow: "pane1", border: "1px solid gray" }}
									// position={"absolute"}
								/>
								<DarkMode>
									<DetailsButtonBar
										show={snap.subItem && !snap.subItem.isLoading}
										item={item}
										tensorId={snap.subItem.tensorId}
									/>
								</DarkMode>
							</VStack>
						)}
					</AnimatePresence>
				</Box>
				<DarkMode>
					<DetailsButtonBar
						show={!snap.subItem}
						item={item}
						addMetadata={true}
						tensorId={itemDetails?.tensor_id}
					/>
				</DarkMode>
				<TensorsList
					flex={"0 0 60px"}
					zIndex={1}
					margin={"1rem"}
					// marginBottom={"-1rem"}
					item={item}
					details={itemDetails}
					candidates={snap.candidates}
					// variants={{
					// 	open: { y: "0%", opacity: 1 },
					// 	closed: { y: "100%", opacity: 0 },
					// }}
					transition={{ duration: transition.duration, delay: 0 }}
					// initial={"closed"}
					// animate={"open"}
					// exit={"closed"}
				/>
			</VStack>

			<VStack height={"100%"} overflow={"clip"} padding={1} zIndex={2} asChild>
				<motion.div>
					{/* <Button
								onClick={() =>
									AppState.setViewRequest("metadata", {
										open: {
											nodeId: snap.item?.node_id,
											projectId: snap.item?.project_id,
											tensorId: snap.item?.tensor_id,
										},
									})
								}
							>
								Hello
							</Button> */}
					<DetailsContent item={item} details={itemDetails} />
				</motion.div>
			</VStack>
		</Container>
	)
}

const Container = chakra(
	motion.div,
	{
		base: {
			position: "absolute",
			display: "grid",
			gridTemplateColumns: "1fr max(18rem, min(40%, 30rem))",
			gap: 0,
			justifyContent: "stretch",
			alignItems: "center",
			inset: 0,
			// overflow: "clip",
			// zIndex: "5",
			padding: 2,
			height: "100%",
			width: "100%",
		},
	},
	{ forwardProps: ["transition"] },
)

interface DetailsButtonBarProps extends ChakraProps {
	item?: ImageExtra
	tensorId?: string
	show?: boolean
	addMetadata?: boolean
}
function DetailsButtonBar(props: DetailsButtonBarProps) {
	const { item, tensorId, show, addMetadata, ...restProps } = props
	const { projects } = useDTP()

	const projectId = item?.project_id
	const nodeId = addMetadata ? item?.node_id : undefined

	const disabled = !projectId || !tensorId || !show
	return (
		<HStack
			alignSelf={"center"}
			margin={2}
			zIndex={1}
			bgColor={"bg.2"}
			justifyContent={"center"}
			borderRadius={"lg"}
			paddingX={2}
			boxShadow={"pane1"}
			border={"1px solid {colors.gray.500/50}"}
			onClick={(e) => e.stopPropagation()}
			asChild
			{...restProps}
		>
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: show ? 1 : 0 }}
				exit={{ opacity: 0, transition: { delay: 0, duration: 0.1 } }}
				transition={{ duration: 0.2, delay: 0.2 }}
			>
				<IconButton size={"sm"} disabled={disabled} onClick={() => {}}>
					<FiCopy />
				</IconButton>
				<IconButton size={"sm"} disabled={disabled} onClick={() => {}}>
					<FiSave />
				</IconButton>
				<IconButton
					size={"sm"}
					disabled={disabled}
					onClick={async () => {
						const projectFile = projects.getProjectFile(projectId)
						if (!projectFile || !tensorId) return
						const imgData = await dtProject.decodeTensor(projectFile, tensorId, true, nodeId)
						if (!imgData) return

						await sendToMetadata(imgData, "png", {
							source: "project",
							projectFile,
							tensorId,
							nodeId,
						})
					}}
				>
					<PiListMagnifyingGlassBold />
				</IconButton>
			</motion.div>
		</HStack>
	)
}

export default DetailsOverlay
