import { Button, chakra } from "@chakra-ui/react"
import { motion } from "motion/react"

export const MotionBox = chakra(motion.div, {}, { forwardProps: ["transition"] })

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
			display: "flex",
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
			borderRadius: "md",
		},
	},
	{ forwardProps: ["transition"] },
)

export const PaneListContainer = chakra("div", {
	base: {
		bgColor: "bg.deep",
		height: "100%",
		width: "100%",
		color: "fg.2",
		paddingY: 0,
		paddingX: 1,
		// borderInline:"2px solid {colors.bg.deep}",
		borderTop: "0.25rem solid {colors.bg.deep}",
		borderRadius: 0,
		gap: 0.5,
		display: "flex",
		justifyContent: "flex-start",
		alignItems: "stretch",
		flexDirection: "column",
		// scrollbarWidth: "thin",
		// scrollbarGutter: "stable",
		overscrollBehavior: "contain"
		// boxShadow: "0px 0px 30px 0px #00000088 inset",
		// border: "1px solid #00000055",
	},
})

export const PanelSectionHeader = chakra("h3", {
	base: {
		paddingX: 2,
		fontWeight: "600",
		color: "fg.2",
	},
})

export const PanelListItem = chakra(
	"div",
	{
		base: {
			bgColor: "bg.2/80",
			color: "fg.2",
			paddingX: 2,
			paddingY: 1,
			borderRadius: 0,
			boxShadow: "0px 0px 18px -8px #00000022",
			borderBlock: "1px solid #00000000",
			transition: "all 0.2s ease-out",
			_focusVisible: {
				outline: "2px solid {colors.blue.400/70} !important",
			},
		},
		variants: {
			selectable: {
				true: {
					_hover: {
						// boxShadow: "0px 0px 18px -8px #00000022, 0px 2px 8px -2px #00000033",
						transform: "scale(1.01)",
						bgColor: "bg.3",
						transition: "all 0.1s ease-out",
					},
				},
			},
			selected: {
				true: {
					bgColor: "color-mix(in srgb, {colors.bg.2} 70%, {colors.blue.600} 30%)",
					color: "fg.1",
					_hover: {
						bgColor: "color-mix(in srgb, {colors.bg.3} 50%, {colors.blue.500} 50%)",
					},
					borderBlock: "1px solid #00000033",
				},
			},
		},
	},
	{ defaultProps: { tabIndex: 0 } },
)

export const PanelButton = chakra(
	Button,
	{
		base: {
			bgColor: "bg.1",
			color: "fg.2",
			height: "min-content",
			paddingY: 2,
		},
		variants: {
			tone: {
				danger: {
					bgColor: "color-mix(in srgb, {colors.bg.1} 70%, {colors.red.500} 30%)",
					// boxShadow: "0px 1px 5px -3px #00000055, 0px 0px 0px -5px {colors.red.500/50} inset",
					_hover: {
						bgColor: "color-mix(in srgb, {colors.bg.1} 60%, {colors.red.500} 40%)",
						border: "1px solid {colors.red.500/40}",
						boxShadow: "0px 1px 5px -3px #00000055",
					},
				},
				none: {
					_hover: {
						border: "1px solid {colors.fg.2/20}",
						boxShadow: "0px 1px 5px -3px #00000055",
						bgColor: "bg.2/50",
					},
				},
			},
		},
		defaultVariants: { tone: "none" },
	},
	{ defaultProps: { size: "sm", variant: "subtle" } },
)
