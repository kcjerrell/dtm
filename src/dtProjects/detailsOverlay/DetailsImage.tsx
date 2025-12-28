import { Box } from "@chakra-ui/react"
import { motion } from "motion/react"
import { type CSSProperties, useRef } from "react"
import { showPreview } from "@/components/preview"
import { contain, withinRect } from "@/utils/rect"

const transition = { duration: 0.25, ease: "circInOut" }

interface DetailsImageProps extends ChakraProps {
	id?: string
	src?: string
	srcHalf?: string
	maskSrc?: string
	naturalSize: { width: number; height: number }
	imgStyle?: CSSProperties
	pixelated?: boolean
}


function DetailsImage(props: DetailsImageProps) {
	const { id, src, srcHalf, maskSrc, naturalSize, imgStyle, pixelated, ...restProps } = props

	const imgContainerRef = useRef<HTMLDivElement>(null)
	const imgRef = useRef<HTMLImageElement>(null)

	const maskProps = maskSrc
		? { maskImage: `url(${maskSrc})`, maskMode: "luminance", maskSize: "contain" }
		: {}

	const coverScale =
		Math.max(naturalSize.width, naturalSize.height) /
		Math.min(naturalSize.width, naturalSize.height)

	if (!srcHalf && !src) return null

	return (
		<Box borderRadius={"md"} asChild {...restProps}>
			<motion.div
				ref={imgContainerRef}
				key={src}
				style={{
					display: "block",
					minHeight: "0",
					minWidth: "0",
					overflow: "clip",
					...imgStyle,
				}}
				transition={{ duration: transition.duration }}
				layout
				layoutId={id}
				onClick={(e) => {
					const rect = contain(
						e.currentTarget.getBoundingClientRect(),
						naturalSize.width,
						naturalSize.height,
					)
					if (!withinRect(rect, e.clientX, e.clientY)) return
					e.stopPropagation()
					showPreview(imgRef.current, src)
				}}
			>
				<motion.img
					width={naturalSize.width}
					height={naturalSize.height}
					ref={imgRef}
					src={src}
					alt={src}
					initial={{ scale: coverScale }}
					animate={{ scale: 1 }}
					exit={{ scale: coverScale }}
					transition={{ duration: transition.duration }}
					style={{
						opacity: 1,
						display: "block",
						imageRendering: pixelated ? "pixelated" : "auto",
						transformOrigin: "center center",
						objectFit: "contain",
						width: "100%",
						height: "100%",
						...maskProps,
					}}
				/>
			</motion.div>
		</Box>
	)
}

export default DetailsImage