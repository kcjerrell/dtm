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
			bgImage: "url(check_light.png)",
			bgSize: "50px 50px",
			bgColor: "#000000",
			width: "100%",
			height: "100%",
			overscrollBehavior: "none none",
			position: "relative",
			borderRadius: "md",
		},
		variants: {
			dark: {
				true: {
					_before: {
						content: '""',
						bgImage: "url(check_dark.png)",
						position: "absolute",
						width: "100%",
						height: "100%",
						bgSize: "50px 50px",
						inset: 0,
						animation: "fadeIn 0.2s ease forwards",
						pointerEvents: 'none'
					},
				},
				false: {
					_before: {
						content: '""',
						bgImage: "url(check_dark.png)",
						position: "absolute",
						width: "100%",
						height: "100%",
						bgSize: "50px 50px",
						inset: 0,
						animation: "fadeOut 0.2s ease forwards",
						pointerEvents: 'none'
					},
				},
			},
		},
	},
	{ forwardProps: ["transition"] },
)

export const PaneListContainer = chakra("div", {
	base: {
		bgColor: "bg.1",
		height: "100%",
		width: "100%",
		color: "fg.2",
		paddingY: 0,
		paddingX: 1,
		borderBlock: "0.25rem solid {colors.bg.1}",
		borderRadius: "sm",
		gap: 0.5,
		display: "flex",
		justifyContent: "flex-start",
		alignItems: "stretch",
		flexDirection: "column",
		overscrollBehavior: "contain",
		overflowY: "clip"
	},
})

export const PaneListScrollContainer = chakra(
	"div",
	{
		base: {
			height: "100%",
			width: "100%",
			paddingY: '1px',
			gap: 0.5,
			display: "flex",
			justifyContent: "flex-start",
			alignItems: "stretch",
			flexDirection: "column",
			overscrollBehavior: "contain",
			scrollBehavior: "smooth",
			overflowY: "auto",
			bgColor: "bg.deep/50",
		},
	},
	{ defaultProps: { className: "hide-scrollbar" } },
)

export const PanelListScrollContent = chakra("div", {
	base: {
		height: "auto",
		// minHeight: "100%",
		display: "flex",
		flexDirection: "column",
		justifyContent: "flex-start",
		alignItems: "stretch",
		gap: 0.5
	},
})

export const PanelSectionHeader = chakra("h3", {
	base: {
		paddingX: 2,
		fontWeight: "500",
		color: "fg.2",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
	},
})

export const PanelListItem = chakra(
	"div",
	{
		base: {
			bgColor: "bg.3",
			color: "fg.2",
			paddingX: 2,
			paddingY: 1,
			borderRadius: "sm",
			boxShadow: "0px 0px 18px -8px #00000022",
			border: "2px solid #00000000",
			transition: "all 0.2s ease-out",
			_focusVisible: {
				outline: "2px inset {colors.blue.400/70} !important",
			},
			willChange: "transform",
			contain: "paint",
		},
		variants: {
			selectable: {
				true: {
					_hover: {
						bgColor: "bg.0",
						transition: "all 0.05s ease-out",
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
					borderBlock: "2px groove #00000033",
				},
			},
			hoverScale: {
				true: {
					_hover: {
						transform: "scale(1.01)",
					},
				}
			}
		},
	},
	{ defaultProps: { tabIndex: 0 } },
)

export const PanelButton = chakra(
	Button,
	{
		base: {
			bgColor: "bg.3",
			margin: 1,
			color: "fg.2",
			height: "min-content",
			paddingY: 2,
			fontWeight: "500",
		},
		variants: {
			tone: {
				danger: {
					bgColor: "color-mix(in srgb, {colors.bg.1} 70%, {colors.red.500} 30%)",
					_hover: {
						bgColor: "color-mix(in srgb, {colors.bg.1} 60%, {colors.red.500} 40%)",
						border: "1px solid {colors.red.500/40}",
						boxShadow: "0px 1px 5px -3px #00000055",
					},
				},
				none: {
					_hover: {
						border: "1px solid {colors.fg.2/20}",
						bgColor: "bg.2",
					},
				},
			},
		},
		defaultVariants: { tone: "none" },
	},
	{ defaultProps: { size: "sm", variant: "subtle" } },
)
