import { Box } from "@chakra-ui/react"
import { motion } from "motion/react"
import { type CSSProperties, useRef } from "react"
import { showPreview } from "@/components/preview"

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

	if (!srcHalf && !src) return null

	return (
		<Box borderRadius={"md"} asChild {...restProps}>
			<motion.div
				ref={imgContainerRef}
				key={src}
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
				style={{
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					minHeight: "0",
					minWidth: "0",
					overflow: "clip",
				}}
				transition={{ duration: transition.duration, ease: "linear" }}
			>
				<motion.img
					width={naturalSize.width}
					height={naturalSize.height}
					ref={imgRef}
					src={src}
					alt={src}
					transition={{
						duration: transition.duration,
						ease: "linear",
					}}
					style={{
						maxWidth: "100%",
						maxHeight: "100%",
						width: "auto",
						height: "auto",
						boxShadow: "pane1",
						borderRadius: "0.5rem",
						opacity: 1,
						display: "block",
						imageRendering: pixelated ? "pixelated" : "auto",
						transformOrigin: "center center",
						objectFit: "contain",
						...imgStyle,
						...maskProps,
					}}
					onClick={(e) => {
						e.stopPropagation()
						showPreview(imgRef.current, src)
					}}
				/>
			</motion.div>
		</Box>
	)
}

export default DetailsImage
