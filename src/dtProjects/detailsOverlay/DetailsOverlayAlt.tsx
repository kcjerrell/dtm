import { Box, chakra, Image } from "@chakra-ui/react"
import { useDTProjects } from "../state/projectStore"
import { Panel } from "@/components"
import { AnimatePresence, motion, ValueAnimationTransition } from "motion/react"
import { ComponentProps, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import DetailsImage from "./DetailsImage"
import { useInitRef } from "@/hooks/useInitRef"
import { proxy, useSnapshot } from "valtio"
import { contain } from "@/components/preview"

const trans: ValueAnimationTransition[] = [
	{
		duration: 0.5,
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
	const { snap, hideDetailsOverlay } = useDTProjects()
	const { item, sourceElement } = snap.detailsOverlay ?? {}
	const src = item ? `dtm://dtproject/thumbhalf/${item.project_id}/${item.preview_id}` : undefined
	const rootRef = useRef<HTMLDivElement>(null)
	const imgRef = useRef<HTMLImageElement>(null)
	const state = useInitRef(() =>
		proxy({
			src: "",
		}),
	)
	const imgSnap = useSnapshot(state)

	return (
		<AnimatePresence>
			{/* {item && ( */}
			<Container
				ref={rootRef}
				pointerEvents={item ? "all" : "none"}
				onClick={() => hideDetailsOverlay()}
				variants={{
					open: { opacity: 1, backgroundColor: "#00000044", backdropFilter: "blur(5px)" },
					close: { opacity: 1, backgroundColor: "#00000000", backdropFilter: "blur(0px)" },
				}}
				initial={"closed"}
				animate={item ? "open" : "close"}
				transition={{ duration: 1 }}
				{...rest}
			>
				<Box ref={imgRef} height={"100%"} flex={"1 1 auto"} display={'flex'} justifyContent={'strech'} alignItems={'stretch'}>
					<AnimatePresence mode={"wait"}>
						{item && (
							<Box
								backgroundImage={`url(${src})`}
								objectFit={"contain"}
								asChild
								// marginX={"auto"}
								// marginY={"auto"}
							>
								<motion.div
									layoutId={`proj_img_${item?.project_id}_${item?.node_id}`}
									layout
									transition={{ duration: 0.3, backgroundSize: { duration: 1 } }}
									// whileHover={{ backgroundSize: "cover" }}
									style={{
										aspectRatio: `${snap.detailsOverlay?.width} / ${snap.detailsOverlay?.height}`,
										backgroundSize: "cover",
									}}
								/>
							</Box>
						)}
					</AnimatePresence>
				</Box>

				<Panel flex={"0 0 auto"} width={"20rem"} height={"70%"} asChild>
					<motion.div
						variants={{
							open: { scale: 0.9, transition: { delay: 0.1, duration: 0.2 } },
							close: { scale: 0.9, opacity: "0%", transition: { duration: 0.2 } },
						}}
						animate={item ? "open" : "close"}
					>
						Hello
					</motion.div>
				</Panel>
			</Container>
			{/* )} */}
		</AnimatePresence>
	)
}

const Container = chakra(motion.div, {
	base: {
		position: "absolute",
		display: "grid",
		gridTemplateColumns: "1fr 20rem",
		gap: 2,
		padding: 2,
		justifyContent: "stretch",
		alignItems: "center",
		top: "0",
		left: "0",
		width: "100%",
		height: "100%",
		overflow: "clip",
		zIndex: "5",
	},
})

export default DetailsOverlay
