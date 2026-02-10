import { type BoxProps, chakra } from "@chakra-ui/react"
import { motion } from "motion/react"
import { useEffect, useRef } from "react"
import type { getMetadataStore } from "../state/store"

interface HistoryItemProps extends BoxProps {
	image: ReadonlyState<ReturnType<typeof getMetadataStore>["images"][number]>
	isSelected: boolean
	onSelect?: () => void
	isPinned?: boolean
}
function HistoryItem(props: HistoryItemProps) {
	const { image, isSelected, onSelect, isPinned, ...restProps } = props
	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (ref.current?.parentElement?.parentElement && isSelected) {
			const item = ref.current
			const scrollContainer = ref.current.parentElement.parentElement
			const xMin = item.offsetLeft
			const xMax = xMin + item.offsetWidth
			const scrollMin = scrollContainer.scrollLeft
			const scrollMax = scrollMin + scrollContainer.offsetWidth
			if (xMin < scrollMin) {
				scrollContainer.scrollTo({ left: xMin })
			}
      else if (xMax > scrollMax) {
        scrollContainer.scrollTo({ left: xMax - scrollContainer.offsetWidth })
      }
		}
	}, [isSelected])

	return (
		<HistoryItemBase
			ref={ref}
			onClick={(e) => {
				e.stopPropagation()
				e.preventDefault()
				onSelect?.()
			}}
			isPinned={isPinned}
			isSelected={isSelected}
			{...restProps}
		>
			<HistoryItemIndicator isSelected={isSelected} isPinned={isPinned} />
			<motion.img
				src={image?.thumbUrl}
				style={{
					objectFit: "cover",
					width: "100%",
					flex: "1 1 auto",
					transformOrigin: "middle middle",
					zIndex: 0,
					borderRadius: "0% 0% 0% 0%",
				}}
				animate={{ opacity: isSelected ? 1 : 0.7 }}
				initial={{ scale: 1.0 }}
				whileHover={{
					borderRadius: isSelected || isPinned ? "0% 0% 0% 0%" : "10% 10% 0 0",
					scale: 1.4,
					opacity: 0.9,
					transition: { scale: { duration: 5, ease: "easeIn" } },
				}}
				transition={{ duration: 0.2, ease: "easeInOut" }}
			/>
		</HistoryItemBase>
	)
}

const HistoryItemBase = chakra("div", {
	base: {
		display: "flex",
		flexDirection: "column",
		height: "4rem",
		width: "4rem",
		flex: "0 0 4rem",
		padding: "0px",
		overflow: "hidden",
		border: "1px solid",
    borderColor: "gray.700/50",
		marginInline: "-0.5px",
		backgroundColor: "var(--chakra-colors-gray-700)",
		marginTop: "0px",
		transformOrigin: "top",
		borderRadius: "0% 0% 0 0",
		zIndex: 0,
		transform: "scale(1) translateY(5px)",
		transition: "all 0.2s ease",
		_hover: {
			borderRadius: "10% 10% 0 0",
			zIndex: 2,
			transform: "scale(1.2) translateY(-2px)",
		},
	},
	variants: {
		isSelected: {
			true: {
				marginTop: "-3px",
				borderRadius: "10% 10% 0 0",
        borderTop: 0,
				zIndex: 1,
				transform: "scale(1.1) translateY(2px)",
			},
		},
		isPinned: {
			true: {
				marginTop: "-3px",
        borderTop: 0,
			},
		},
	},
})

const HistoryItemIndicator = chakra("div", {
	base: {
		width: "100%",
		borderRadius: "10% 10% 0 0",
		zIndex: 2,
		height: 0,
		flex: "0 0 auto",
		transition: "all 0.2s ease",
	},
	variants: {
		isSelected: {
			true: {
				backgroundColor: "var(--chakra-colors-highlight)",
				height: "3px",
			},
		},
		isPinned: {
			true: {
				backgroundColor: "var(--chakra-colors-info)",
				height: "3px",
			},
		},
	},
	compoundVariants: [
		{
			isPinned: true,
			isSelected: true,
			css: {
				backgroundColor: "var(--chakra-colors-highlight)",
			},
		},
	],
})

export default HistoryItem
