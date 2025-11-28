import { Box, chakra, HStack, Spinner, VStack } from "@chakra-ui/react"
import { AnimatePresence, motion } from "motion/react"
import type { ComponentProps } from "react"
import { FiCopy, FiSave } from "react-icons/fi"
import { PiListMagnifyingGlassBold } from "react-icons/pi"
import { useSnapshot } from "valtio"
import type { ImageExtra } from "@/commands"
import urls from "@/commands/urls"
import { IconButton } from "@/components"
import AppState from "@/hooks/appState"
import { useDTProjects } from "../state/projectStore"
import DetailsContent from "./DetailsContent"
import DetailsImage from "./DetailsImage"
import TensorsList from "./TensorsList"

const transition = { duration: 0.25, ease: "easeInOut" }

interface DetailsOverlayProps extends ComponentProps<typeof Container> {}

function DetailsOverlay(props: DetailsOverlayProps) {
	const { ...rest } = props
	const { store: dtp, snap: dtpSnap } = useDTProjects()

	const snap = useSnapshot(dtp.state.detailsOverlay)
	const details = snap.item ? dtpSnap.itemDetails[snap.item.node_id] : null
	const subItem = snap.subItem

	const srcHalf =
		snap.item || snap.lastItem
			? urls.thumbHalf(snap.item ?? (snap.lastItem as ImageExtra))
			: undefined
	const srcFull =
		snap.item || snap.lastItem ? urls.thumb(snap.item ?? (snap.lastItem as ImageExtra)) : undefined

	return (
		<AnimatePresence>
			{snap.item && (
				<Container
					key={snap.item.id}
					pointerEvents={snap.item ? "all" : "none"}
					onClick={() => {
						if (subItem) dtp.hideSubItem()
						else dtp.hideDetailsOverlay()
					}}
					variants={{
						open: {
							opacity: 1,
							backgroundColor: "#00000099",
							backdropFilter: "blur(5px)",
							visibility: "visible",
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
							visibility: "hidden",
							transition: {
								duration: transition.duration,
								visibility: {
									duration: 0,
									delay: transition.duration,
								},
							},
						},
					}}
					initial={"closed"}
					exit={"closed"}
					animate={snap.item ? "open" : "closed"}
					transition={{ duration: transition.duration }}
					{...rest}
				>
					<VStack
						padding={4}
						paddingBottom={2}
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
								sourceRect={snap.sourceRect}
								naturalSize={{ width: snap.width, height: snap.height }}
								position={"absolute"}
								zIndex={0}
								// filter={subItem ? "blur(2px)" : "none"}
								imgStyle={{
									filter: subItem ? "brightness(0.5)" : "none",
									transition: "filter 0.3s ease",
								}}
								transition={"filter 0.3s ease"}
							/>
							<AnimatePresence initial={false} mode={"sync"}>
								{subItem?.isLoading && (
									<Spinner
										color={"white"}
										bgColor={"black"}
										padding={1}
										left="50%"
										top="50%"
										position="absolute"
										transform="translate(-50%, -50%)"
									/>
								)}
								{subItem && (
									<VStack
										height={"100%"}
										width={"100%"}
										alignItems={"center"}
										padding={1}
										zIndex={1}
										key={subItem?.tensorId}
										position={"absolute"}
									>
										<DetailsImage
											width={"100%"}
											flex={"1 1 auto"}
											src={subItem?.url}
											srcHalf={subItem?.thumbUrl}
											sourceRect={() => dtp.state.detailsOverlay.subItemSourceRect}
											naturalSize={{ width: subItem?.width, height: subItem?.height }}
											zIndex={1}
											imgStyle={{ boxShadow: "pane1", border: "1px solid gray" }}
											// position={"absolute"}
										/>
										<DetailsButtonBar
											show={subItem && !subItem.isLoading}
											projectId={snap.item.project_id}
											tensorId={subItem.tensorId}
										/>
									</VStack>
								)}
							</AnimatePresence>
						</Box>
						<DetailsButtonBar
							show={!subItem}
							projectId={snap.item.project_id}
							tensorId={details?.tensor_id}
							nodeId={snap.item.node_id}
						/>
						<TensorsList
							flex={"0 0 4rem"}
							margin={"1rem"}
							item={snap.item ?? snap.lastItem}
							details={details}
							candidates={snap.candidates}
							variants={{
								open: { y: "0%", opacity: 1 },
								closed: { y: "100%", opacity: 0 },
							}}
							transition={{ duration: transition.duration, delay: 0 }}
							initial={"closed"}
							animate={"open"}
							exit={"closed"}
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
											tensorId: details?.tensor_id,
										},
									})
								}
							>
								Hello
							</Button> */}
							<DetailsContent item={snap.item} details={details} />
						</motion.div>
					</VStack>
				</Container>
			)}
		</AnimatePresence>
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
	projectId?: number
	tensorId?: string
	nodeId?: number
	show?: boolean
}
function DetailsButtonBar(props: DetailsButtonBarProps) {
	const { projectId, tensorId, nodeId, show, ...restProps } = props
	const disabled = !projectId || !tensorId
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
			border={"1px solid gray"}
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
					onClick={() => {
						AppState.setViewRequest("metadata", {
							open: {
								nodeId,
								projectId,
								tensorId,
							},
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
