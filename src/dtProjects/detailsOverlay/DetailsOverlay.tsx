import { Box, Button, chakra, Image, VStack } from "@chakra-ui/react"
import {
	AnimatePresence,
	motion,
	useAnimate,
	useMotionValue,
	type ValueAnimationTransition,
} from "motion/react"
import { type ComponentProps, useEffect, useRef } from "react"
import { proxy, subscribe } from "valtio"
import type { ImageExtra } from "@/commands"
import urls from "@/commands/urls"
import { DataItem, Panel } from "@/components"
import { contain } from "@/components/preview"
import { useInitRef } from "@/hooks/useInitRef"
import { useDTProjects } from "../state/projectStore"
import TensorsList from "./TensorsList"
import AppState from "@/hooks/appState"

const trans: ValueAnimationTransition[] = [
	{
		duration: 0.2,
		delay: 0,
	},
	{
		duration: 0.5,
		delay: 0.5,
	},
]
const transtrans = {
	top: trans[0],
	left: trans[0],
	width: trans[1],
	height: trans[1],
}

interface DetailsOverlayProps extends ComponentProps<typeof Container> {}

function DetailsOverlay(props: DetailsOverlayProps) {
	const { ...rest } = props
	const { snap, hideDetailsOverlay, state: dtpState } = useDTProjects()

	const { item, lastItem, sourceElement } = snap.detailsOverlay ?? {}
	const details = item ? snap.itemDetails[item?.node_id] : null

	const srcFull = item || lastItem ? urls.thumb(item ?? (lastItem as ImageExtra)) : undefined
	// const srcFull = details
	// 	? urls.tensor(item?.project_id, details.tensor_id, item?.node_id)
	// 	: item || lastItem
	// 		? urls.thumb(item ?? (lastItem as ImageExtra))
	// 		: undefined

	const rootRef = useRef<HTMLDivElement>(null)
	const imgRef = useRef<HTMLImageElement>(null)
	const mImgRef = useRef<HTMLImageElement>(null)

	// const [scope, anim] = useAnimate()

	// const mvTop = useMotionValue(0)
	// const mvLeft = useMotionValue(0)
	// const mvWidth = useMotionValue(0)
	// const mvHeight = useMotionValue(0)

	// const animBack = useRef<(() => void) | null>(null)

	// useEffect(() => {
	// 	if (!imgRef.current) return
	// 	const unsubscribe = subscribe(dtpState.detailsOverlay, () => {
	// 		console.log("subscribe function")
	// 		const { item, sourceRect, width, height } = dtpState.detailsOverlay
	// 		if (!rootRef.current || !imgRef.current || !sourceRect) return
	// 		const rootRect = rootRef.current.getBoundingClientRect()
	// 		const imgRect = imgRef.current.getBoundingClientRect()
	// 		const cRect = contain(width, height, imgRect.width, imgRect.height)

	// 		if (item) {
	// 			console.log("animating", rootRect.left)
	// 			mvTop.set(sourceRect.top - rootRect.top)
	// 			mvLeft.set(sourceRect.left - rootRect.left)
	// 			mvWidth.set(sourceRect.width)
	// 			mvHeight.set(sourceRect.height)

	// 			anim(mImgRef.current, { opacity: 0.5 }, { duration: 0 })

	// 			anim(mvTop, cRect.top - rootRect.top, trans[0])
	// 			anim(mvLeft, cRect.left - rootRect.left, trans[0])
	// 			anim(mvWidth, cRect.width, trans[0])
	// 			anim(mvHeight, cRect.height, trans[0])

	// 			state.src = `dtm://dtproject/thumbhalf/${item.project_id}/${item.preview_id}`

	// 			animBack.current = () => {
	// 				console.log("animating back", rootRect.left)
	// 				anim(mvTop, sourceRect.top - imgRect.top, trans[0])
	// 				anim(mvLeft, sourceRect.left - imgRect.left, trans[0])
	// 				anim(mvWidth, sourceRect.width, trans[0])
	// 				anim(mvHeight, sourceRect.height, trans[0]).finished.then(() => {
	// 					anim(mImgRef.current, { opacity: 0 }, { duration: 0 })
	// 				})
	// 			}
	// 		} else {
	// 			animBack.current?.()
	// 		}
	// 	})

	// 	const ro = new ResizeObserver((e) => {
	// 		console.log("resize")
	// 		if (!imgRef.current || !dtpState.detailsOverlay.item) return
	// 		const imgRect = imgRef.current.getBoundingClientRect()
	// 		const cRect = contain(
	// 			dtpState.detailsOverlay.width,
	// 			dtpState.detailsOverlay.height,
	// 			imgRect.width,
	// 			imgRect.height,
	// 		)
	// 		console.log(cRect)
	// 		mvTop.set(cRect.top)
	// 		mvLeft.set(cRect.left)
	// 		mvWidth.set(cRect.width)
	// 		mvHeight.set(cRect.height)
	// 	})
	// 	ro.observe(imgRef.current)

	// 	return () => {
	// 		unsubscribe()
	// 		ro.disconnect()
	// 	}
	// }, [anim, dtpState, mvLeft, mvTop, mvWidth, mvHeight, state])

	return (
		<AnimatePresence>
			{/* {item && ( */}
			<Container
				ref={rootRef}
				// display={item ? "grid" : "none"}

				pointerEvents={item ? "all" : "none"}
				onClick={() => hideDetailsOverlay()}
				variants={{
					open: {
						opacity: 1,
						backgroundColor: "#00000099",
						backdropFilter: "blur(5px)",
						visibility: "visible",
						filter: "blur(0px)",
						transition: {
							visibility: { delay: 0, duration: 0 },
							// opacity: { duration: 0.2 },
							duration: 0.2,
							ease: "easeOut",
						},
					},
					close: {
						opacity: 0,
						backgroundColor: "#00000000",
						backdropFilter: "blur(0px)",
						filter: "blur(5px)",
						visibility: "hidden",
						transition: { visibility: { delay: 0.1, duration: 0 } },
					},
				}}
				initial={"closed"}
				exit={"closed"}
				animate={item ? "open" : "close"}
				transition={{ duration: 0.1 }}
				{...rest}
			>
				<VStack
					padding={8}
					gap={0}
					width={"100%"}
					height={"100%"}
					overflowY={"clip"}
					alignItems={"stretch"}
				>
					<Box width={"100%"} flex={"1 1 auto"} overflow={"clip"} position={"relative"}>
						{/* <Image src={src} objectFit={"contain"} width={"100%"} height={"100%"} asChild>
						<motion.img
							animate={{ visibility: item ? "visible" : "hidden" }}
							transition={{ delay: item ? 1 : 0 }}
						/>
					</Image> */}
						<AnimatePresence>
							{/* {item && ( */}
							{/* <Image
								zIndex={10}
								position={"absolute"}
								// top={imgSnap.fromTop}
								// left={imgSnap.fromLeft}
								// width={imgSnap.fromWidth}
								// height={imgSnap.fromHeight}
								flex={"1 1 auto"}
								src={src}
								objectFit={"cover"}
								asChild
							>
								<motion.img
									ref={mImgRef}
									// exit={{
									// 	...snap.detailsOverlay.sourceRect
									// }}
									style={{
										top: mvTop,
										left: mvLeft,
										width: mvWidth,
										height: mvHeight,
									}}
									transition={{
										duration: 0.2,
										times: [0, 1],
										objectFit: { delay: 0.3 },
										// ease: ["anticipate", "anticipate", "anticipate", "anticipate"],
									}}
								/>
							</Image> */}
							{/* )} */}
						</AnimatePresence>
						<Image
							key={srcFull}
							ref={imgRef}
							src={srcFull}
							width={"100%"}
							height={"100%"}
							objectFit={"contain"}
						>
							{/* <motion.img
								// initial={{ maskImage: "radial-gradient(circle, #000000FF 20%, #00000000 20%)" }}
								initial={{ opacity: 0 }}
								animate={{
									// maskImage: [
									// 	"radial-gradient(circle, #000000FF 0%, #00000000 50%)",
									// 	"radial-gradient(circle, #000000FF 10%, #00000000 95%)",
									// 	"radial-gradient(circle, #000000FF 75%, #00000000 100%)",
									// 	"radial-gradient(circle, #000000FF 100%, #00000000 100%)",
									// ],
									opacity: item ? 1 : 0,
								}}
								transition={{ duration: 0.3, delay: 0.1 }}
							/> */}
						</Image>
					</Box>
					<TensorsList
						flex={"0 0 6rem"}
						item={item ?? lastItem}
						details={details}
						candidates={snap.detailsOverlay.candidates}
					/>
				</VStack>

				<VStack height={"100%"} overflow={"clip"} padding={1}>
					<Button
						onClick={() =>
							AppState.setViewRequest("metadata", {
								open: {
									nodeId: item?.node_id,
									projectId: item?.project_id,
									tensorId: details?.tensor_id,
								},
							})
						}
					>
						Hello
					</Button>
					<Panel
						flex={"1 1 auto"}
						key={item?.id}
						overflowY={"scroll"}
						overflowX={"clip"}
						onClick={(e) => e.stopPropagation()}
						asChild
					>
						<motion.div
						// variants={{
						// 	open: { scale: 1, opacity: 1, transition: { delay: 0.1, duration: 0.2 } },
						// 	close: { scale: 0.9, opacity: 0, transition: { duration: 0.2 } },
						// }}
						// initial={"close"}
						// animate={item ? "open" : "close"}
						>
							<DataItem label={"Prompt"} data={item?.prompt} maxLines={6} />
							<DataItem label={"Negative Prompt"} data={item?.negative_prompt} maxLines={6} />
							<DataItem label={"Tensor ID"} data={details?.tensor_id} />
							<DataItem label={"Depth Map ID"} data={details?.depth_map_id} />
							<DataItem label={"Pose ID"} data={details?.pose_id} />
							<DataItem label={"Scribble ID"} data={details?.scribble_id} />
							<DataItem label={"Color Palette ID"} data={details?.color_palette_id} />
							<DataItem label={"Custom ID"} data={details?.custom_id} />
							<DataItem label={"Raw"} data={JSON.stringify(details, null, 2)} />
						</motion.div>
					</Panel>
				</VStack>
			</Container>
			{/* )} */}
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
			overflow: "clip",
			zIndex: "5",
			padding: 2,
		},
	},
	{ forwardProps: ["transition"] },
)

export default DetailsOverlay
