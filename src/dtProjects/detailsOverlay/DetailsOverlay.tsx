import { chakra, VStack } from "@chakra-ui/react"
import { AnimatePresence, motion } from "motion/react"
import type { ComponentProps } from "react"
import { useSnapshot } from "valtio"
import type { ImageExtra } from "@/commands"
import urls from "@/commands/urls"
import { DataItem, Panel } from "@/components"
import { useDTProjects } from "../state/projectStore"
import DetailsImage from "./DetailsImage"
import TensorsList from "./TensorsList"

const transition = { duration: 0.25, ease: "easeInOut" }

interface DetailsOverlayProps extends ComponentProps<typeof Container> {}

function DetailsOverlay(props: DetailsOverlayProps) {
	const { ...rest } = props
	const { store: dtp, snap: dtpSnap } = useDTProjects()

	const snap = useSnapshot(dtp.state.detailsOverlay)
	const details = snap.item ? dtpSnap.itemDetails[snap.item.node_id] : null

	const srcHalf = snap.item || snap.lastItem ? urls.thumbHalf(snap.item ?? (snap.lastItem as ImageExtra)) : undefined
	const srcFull =
		snap.item || snap.lastItem ? urls.thumb(snap.item ?? (snap.lastItem as ImageExtra)) : undefined

	return (
		<AnimatePresence>
			{snap.item && (
				<Container
					key={snap.item.id}
					pointerEvents={snap.item ? "all" : "none"}
					onClick={() => dtp.hideDetailsOverlay()}
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
						padding={8}
						gap={0}
						minHeight={0}
						width={"100%"}
						height={"100%"}
						overflowY={"clip"}
						alignItems={"stretch"}
					>
						<DetailsImage src={srcFull} srcHalf={srcHalf} />

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
							<Panel
								flex={"1 1 auto"}
								key={snap.item?.id}
								overflowY={"scroll"}
								overflowX={"clip"}
								onClick={(e) => e.stopPropagation()}
								asChild
							>
								<motion.div
									variants={{
										open: {
											opacity: 1,
											transition: {
												duration: transition.duration * 0.75,
												delay: transition.duration * 0.25,
											},
										},
										closed: {
											opacity: 0,
											transition: { duration: transition.duration },
										},
									}}
									initial={"closed"}
									animate={"open"}
									exit={"closed"}
								>
									<DataItem label={"Prompt"} data={snap.item?.prompt} maxLines={6} />
									<DataItem
										label={"Negative Prompt"}
										data={snap.item?.negative_prompt}
										maxLines={6}
									/>
									<DataItem label={"Tensor ID"} data={details?.tensor_id} />
									<DataItem label={"Depth Map ID"} data={details?.depth_map_id} />
									<DataItem label={"Pose ID"} data={details?.pose_id} />
									<DataItem label={"Scribble ID"} data={details?.scribble_id} />
									<DataItem label={"Color Palette ID"} data={details?.color_palette_id} />
									<DataItem label={"Custom ID"} data={details?.custom_id} />
									<DataItem label={"Raw"} data={JSON.stringify(details, null, 2)} />
								</motion.div>
							</Panel>
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

export default DetailsOverlay
