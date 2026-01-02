import { chakra } from "@chakra-ui/react"
import { motion } from "motion/react"

export const DetailsImageContainer = chakra(motion.div, {
	base: {
		display: "flex",
		justifyContent: "center",
		alignItems: "center",
		minHeight: "0",
		minWidth: "0",
		overflow: "clip",
		borderRadius: "md",
	},
}, { forwardProps: ["transition"] })

export const DetailsImageContent = chakra(motion.img, {
	base: {
		maxWidth: "100%",
		maxHeight: "100%",
		width: "auto",
		height: "auto",
		boxShadow: "pane1",
		borderRadius: "0.5rem",
		opacity: 1,
		display: "block",
		transformOrigin: "center center",
		objectFit: "contain",
	},
	variants: {
		pixelated: {
			true: { imageRendering: "pixelated" },
		},
		dimmed: {
			true: {
				filter: "brightness(0.5)",
				transition: "filter 0.3s ease",
			},
		},
		subitem: {
			true: {
				boxShadow: "pane1",
				border: "1px solid gray",
			},
		},
	},
}, { forwardProps: ["transition", "width", "height"] })

export const DetailsSpinnerRoot = chakra("div", {
	base: {
		width: "5rem",
		height: "5rem",
		bgColor: "#000000aa",
		padding: 4,
		borderRadius: "50%",
		left: "50%",
		top: "50%",
		position: "absolute",
		transform: "translate(-50%, -50%)",
		zIndex: 30,
	},
})
