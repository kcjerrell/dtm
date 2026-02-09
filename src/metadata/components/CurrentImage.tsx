import { Box, chakra, Flex } from "@chakra-ui/react"
import { AnimatePresence, motion, } from "motion/react"
import { useRef } from "react"
import { useSnapshot } from "valtio"
import { showPreview } from "@/components/preview"
import { getMetadataStore } from "../state/store"

interface CurrentImageProps extends ChakraProps {}

function CurrentImage(props: CurrentImageProps) {
	const { ...restProps } = props

	const snap = useSnapshot(getMetadataStore())
	const { currentImage } = snap

	const imgRef = useRef<HTMLImageElement>(null)

	return (
		<Box
			position={"relative"}
			flex={"1 1 auto"}
			display="flex"
			justifyContent="center"
			alignItems="center"
			minWidth={0}
			minHeight={0}
			padding={currentImage ? 1 : 8}
			width={"100%"}
			{...restProps}
		>
			<AnimatePresence mode={'popLayout'}>
				{currentImage?.url ? (
					<Img
						key={currentImage?.id}
						ref={imgRef}
						src={currentImage?.url}
						onClick={(e) => showPreview(e.currentTarget)}
						initial={{ opacity: 0, zIndex: 1 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0, zIndex: 0, transition: {duration: 0} }}
						transition={{duration: 0}}
					/>
				) : (
					<Flex color={"fg/50"} fontSize={"xl"} justifyContent={"center"} alignItems={"center"}>
						Drop image here
					</Flex>
				)}
			</AnimatePresence>
		</Box>
	)
}

export default CurrentImage

export const Img = motion.create(
	chakra(
		"img",
		{
			base: {
				maxWidth: "100%",
				maxHeight: "100%",
				minWidth: 0,
				minHeight: 0,
				borderRadius: "sm",
				boxShadow: "pane1",
			},
		},
		{ defaultProps: { draggable: false } },
	),
)
