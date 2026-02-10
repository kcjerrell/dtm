import { chakra, type StackProps } from "@chakra-ui/react"
import { motion, useMotionValue } from "motion/react"
import { useCallback, useRef } from "react"
import { useSnapshot } from "valtio"
import type { ImageItem } from "../state/ImageItem"
import { getMetadataStore, selectImage } from "../state/store"
import HistoryItem from "./HistoryItem"

interface HistoryProps extends Omit<StackProps, "onSelect"> {}

function History(props: HistoryProps) {
	const { ...restProps } = props

	const snap = useSnapshot(getMetadataStore())
	const { images, currentImage } = snap

	const pinned = images.filter((i) => i.pin != null) as ImageItem[]
	const unpinned = images.filter((i) => i.pin == null) as ImageItem[]
	const imageItems = [...pinned, ...unpinned] as ReadonlyState<ImageItem[]>

	const scrollRef = useRef<HTMLDivElement>(null)

	const scrollbarLeft = useMotionValue(0)
	const scrollbarRight = useMotionValue(0)
	const scrollbarBottom = useMotionValue(0)

	const updateScroll = useCallback(() => {
		if (!scrollRef.current) return
		const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
		if (clientWidth >= scrollWidth) {
			scrollbarLeft.set(0)
			scrollbarRight.set(0)
			scrollbarBottom.set(-5)
			return
		}
		const leftP = scrollLeft / scrollWidth
		const rightP = (scrollLeft + clientWidth) / scrollWidth
		scrollbarLeft.set(leftP * clientWidth)
		scrollbarRight.set((rightP - leftP) * clientWidth)
		scrollbarBottom.set(0)
	}, [scrollbarLeft, scrollbarRight, scrollbarBottom.set])

	return (
		<HistoryContainer>
			<motion.div
				className="history-scrollbar"
				style={{
					backgroundColor: "#272932",
					zIndex: 2,
					position: "absolute",
					bottom: scrollbarBottom,
					width: "100%",
					left: 0,
					right: 0,
					boxShadow: "0px 0px 2px 0px #00000055",
				}}
			/>
			<motion.div
				className="history-scrollbar"
				style={{
					backgroundColor: "var(--chakra-colors-highlight)",
					zIndex: 3,
					position: "absolute",
					bottom: scrollbarBottom,
					width: scrollbarRight,
					left: scrollbarLeft,
					borderRadius: "2px",
				}}
			/>

			<HistoryScrollContainer
				ref={(elem: HTMLDivElement) => {
					if (!elem) return
					scrollRef.current = elem
					const ro = new ResizeObserver(updateScroll)
					ro.observe(elem)
					return () => ro.disconnect()
				}}
				onScroll={updateScroll}
			>
				<HistoryContent {...restProps}>
					{imageItems.map((image) => (
						<HistoryItem
							key={image.id}
							image={image}
							isSelected={currentImage?.id === image.id}
							onSelect={() => selectImage(image)}
							isPinned={image.pin != null}
						/>
					))}
				</HistoryContent>
			</HistoryScrollContainer>
		</HistoryContainer>
	)
}

export default History

const HistoryContainer = chakra(
	"div",
	{
		base: {
			position: "relative",
			// marginBottom: "-4px",
			flex: "0 0 auto",
			transition: "transform 0.1s ease-in-out",
			marginTop: "-1.5rem",
			height: "4rem",
			"&:hover > div.history-scrollbar": {
				height: "3px",
			},
			"& > div.history-scrollbar": {
				height: "0px",
				transition: "height 0.2s",
			},
		},
	},
	{ defaultProps: { className: "group" } },
)

const HistoryScrollContainer = chakra("div", {
	base: {
		overflowX: "auto",
		overflowY: "clip",
		height: "100%",
		"&::-webkit-scrollbar": { display: "none" },
	},
})

const HistoryContent = chakra("div", {
	base: {
		display: "flex",
		flexDirection: "row",
		gap: "-1px",
		overflow: "visible",
		position: "relative",
		transform: "translateY(1.5rem)",
		transition: "transform 0.15s ease",
		_groupHover: { transform: "translateY(1rem)" },
	},
})
