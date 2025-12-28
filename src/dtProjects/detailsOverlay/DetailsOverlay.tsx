import { chakra, HStack, Spinner } from "@chakra-ui/react"
import { AnimatePresence, motion } from "motion/react"
import { type ComponentProps, useMemo } from "react"
import { FiCopy, FiSave } from "react-icons/fi"
import { PiListMagnifyingGlassBold } from "react-icons/pi"
import type { Snapshot } from "valtio"
import { dtProject, type ImageExtra } from "@/commands"
import urls from "@/commands/urls"
import { IconButton } from "@/components"
import { Hotkey } from "@/hooks/keyboard"
import { sendToMetadata } from "@/metadata/state/interop"
import { useDTP } from "../state/context"
import type { UIControllerState } from "../state/uiState"
import DetailsContent from "./DetailsContent"
import DetailsImage from "./DetailsImage"
import { DTImageProvider } from "./DTImageContext"
import TensorsList from "./TensorsList"

const transition = { duration: 0.25, ease: "easeInOut" }

interface DetailsOverlayProps extends ComponentProps<typeof Container> {}

function DetailsOverlay(props: DetailsOverlayProps) {
	const { ...rest } = props

	const { uiState } = useDTP()
	const snap = uiState.useDetailsOverlay()

	const { item, itemDetails } = snap

	const isVisible = !!item

	const srcHalf =
		item || snap.lastItem ? urls.thumbHalf(item ?? (snap.lastItem as ImageExtra)) : undefined
	const srcFull =
		item || snap.lastItem ? urls.thumb(item ?? (snap.lastItem as ImageExtra)) : undefined

	const hotkeys = useMemo(
		() => ({ escape: () => uiState.hideDetailsOverlay(), left: () => {} }),
		[uiState],
	)

	return (
		<DTImageProvider image={snap.itemDetails}>
			<Container
				pointerEvents={isVisible ? "auto" : "none"}
				onClick={() => {
					if (snap.subItem) uiState.hideSubItem()
					else uiState.hideDetailsOverlay()
				}}
				variants={{
					open: {
						backgroundColor: "#00000099",
						backdropFilter: "blur(5px)",
						visibility: "visible",
						transition: {
							visibility: {
								duration: 0,
								delay: 0,
							},
							duration: transition.duration,
							ease: "easeInOut",
						},
					},
					closed: {
						backgroundColor: "#00000000",
						backdropFilter: "blur(0px)",
						visibility: "hidden",
						transition: {
							visibility: {
								duration: 0,
								delay: transition.duration,
							},
							duration: transition.duration,
							ease: "easeInOut",
						},
					},
				}}
				initial={"closed"}
				exit={"closed"}
				animate={isVisible ? "open" : "closed"}
				transition={{ duration: transition.duration }}
				{...rest}
			>
				{isVisible && <Hotkey scope="details-overlay" handlers={hotkeys} />}
				<AnimatePresence>
					{isVisible && (
						<DetailsImage
							key={"details_image"}
							width={"100%"}
							height={"100%"}
							padding={0}
							paddingTop={0}
							gridArea={"image"}
							zIndex={0}
							id={`${item.project_id}_${item.node_id}`}
							src={srcFull}
							srcHalf={srcHalf}
							naturalSize={{ width: snap.width ?? 1, height: snap.height ?? 1 }}
							imgStyle={{
								filter: snap.subItem ? "brightness(0.5)" : "none",
								transition: "filter 0.3s ease",
							}}
						/>
					)}
					{snap.subItem?.isLoading && (
						<Spinner
							key={"subitem_spinner"}
							gridArea={"image"}
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
						<DetailsImage
							key={"subitem_image"}
							padding={10}
							width={"100%"}
							height={"100%"}
							paddingTop={0}
							gridArea={"image"}
							zIndex={0}
							id={`${item?.project_id}_${item?.node_id}_${snap.subItem.tensorId}`}
							pixelated={snap.subItem?.tensorId?.startsWith("color")}
							src={snap.subItem?.url}
							maskSrc={snap.subItem?.applyMask ? snap.subItem?.maskUrl : undefined}
							// sourceRect={() => snap.subItemSourceRect}
							// sourceElement={snap.subItem.sourceElement as HTMLElement}
							naturalSize={{
								width: snap.subItem?.width ?? 1,
								height: snap.subItem?.height ?? 1,
							}}
							imgStyle={{ boxShadow: "pane1", border: "1px solid gray" }}
						/>
					)}
					<DetailsButtonBar
						key={"details_button_bar"}
						transform={snap.subItem ? "translateY(-2rem)" : "unset"}
						marginY={-3}
						zIndex={5}
						alignSelf={"center"}
						justifySelf={"center"}
						gridArea={"commandBar"}
						item={item}
						show={true}
						subItem={snap.subItem}
						addMetadata={!snap.subItem}
						tensorId={snap.subItem?.tensorId ?? itemDetails?.images?.tensorId}
					/>
					<TensorsList
						key={"tensors_list"}
						gridArea={"tensors"}
						zIndex={1}
						item={item}
						details={itemDetails}
						candidates={snap.candidates}
						transition={{ duration: transition.duration }}
					/>
				</AnimatePresence>
				{isVisible && (
					<DetailsContent
						key={`details_content`}
						gridArea={"content"}
						height={"100%"}
						overflow={"clip"}
						zIndex={2}
						item={item}
						details={itemDetails}
					/>
				)}
			</Container>
		</DTImageProvider>
	)
}

const Container = chakra(
	motion.div,
	{
		base: {
			position: "absolute",
			display: "grid",
			gridTemplateColumns: "1fr max(18rem, min(40%, 30rem))",
			gridTemplateRows: "1fr auto auto",
			gridTemplateAreas: '"image content" "commandBar content" "tensors content"',
			width: "100%",
			height: "100%",
			gap: 6,
			padding: 6,
			justifyContent: "stretch",
			alignItems: "center",
			// inset: 0,
			// overflow: "clip",
			// zIndex: "5",
		},
	},
	{ forwardProps: ["transition"] },
)

interface DetailsButtonBarProps extends ChakraProps {
	item?: ImageExtra
	tensorId?: string
	show?: boolean
	addMetadata?: boolean
	subItem?: Snapshot<UIControllerState["detailsView"]["subItem"]>
}
function DetailsButtonBar(props: DetailsButtonBarProps) {
	const { item, tensorId, show, addMetadata, subItem, ...restProps } = props
	const { projects, uiState } = useDTP()

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
				// exit={{ opacity: 0, transition: { delay: 0, duration: 0.5 } }}
				transition={{ duration: 0.2, delay: 0.2 }}
			>
				{subItem?.maskUrl && (
					<IconButton
						size={"sm"}
						disabled={disabled}
						onClick={() => uiState.toggleSubItemMask()}
					>
						<FiCopy />
					</IconButton>
				)}
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
						const imgData = await dtProject.decodeTensor(
							projectFile,
							tensorId,
							true,
							nodeId,
						)
						if (!imgData) return
						console.log(projectFile, tensorId, nodeId)
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
