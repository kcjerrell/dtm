import { chakra } from '@chakra-ui/react';
import { motion } from 'motion/react';

export const MotionBox = chakra(motion.div, {}, {forwardProps: ['transition']})

export const Panel = chakra("div", {
	base: {
		display: "flex",
		flexDirection: "column",
		alignItems: "stretch",
		justifyContent: "flex-start",
		padding: 2,
		borderRadius: "md",
		boxShadow: "pane1",
		backgroundColor: "bg.1",
	},
	variants: {
		glass: {
			true: {
				// background: "radial-gradient(ellipse at center, {colors.bg.1/20} 60%, {colors.bg.1/0} 100%)",
				bgColor: "transparent",
				backdropFilter: "blur(8px)",
			},
		},
	},
})

export const CheckRoot = chakra(
	motion.div,
	{
		base: {
			display: 'flex',
			bgImage: {
				_light: "url(check_light.png)",
				_dark: "url(check_dark.png)",
			},
			bgSize: "50px 50px",
			// bgPos: "right",
			width: "100%",
			height: "100%",
			overscrollBehavior: "none none",
			position: "relative",
			borderRadius: "md"
		},
	},
	{ forwardProps: ["transition"] },
)