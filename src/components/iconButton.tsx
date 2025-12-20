import { chakra } from "@chakra-ui/react"

// from the chakra ui button recipe
// https://github.com/chakra-ui/chakra-ui/blob/main/packages/react/src/theme/recipes/button.ts

const IconButton = chakra("button", {
	base: {
		color: "fg.3",
		backgroundColor: "transparent",
		aspectRatio: "1",
		bgColor: "transparent",
		display: "inline-flex",
		appearance: "none",
		alignItems: "center",
		justifyContent: "center",
		userSelect: "none",
		position: "relative",
		borderRadius: "l2",
		whiteSpace: "nowrap",
		verticalAlign: "middle",
		borderWidth: "1px",
		borderColor: "transparent",
		cursor: "button",
		flexShrink: "0",
		outline: "0",
		lineHeight: "1.2",
		isolation: "isolate",
		fontWeight: "medium",
		transitionProperty: "common",
		transitionDuration: "moderate",
		focusVisibleRing: "outside",
		_hover: {
			scale: "1.2",
			color: "fg.1",
		},
		_disabled: {
			layerStyle: "disabled",
			cursor: "default",
		},
		_icon: {
			flexShrink: "0",
		},
	},

	variants: {
		size: {
			min: {
				h: "min-content",
				minH: 0,
				w: "min-content",
				minW: 0,
				textStyle: "xs",
				_icon: {
					width: "5",
					height: "5",
				},
			},
			"2xs": {
				h: "6",
				minW: "6",
				textStyle: "xs",
				px: "2",
				gap: "1",
				_icon: {
					width: "3.5",
					height: "3.5",
				},
			},
			xs: {
				h: "8",
				minW: "8",
				textStyle: "xs",
				px: "2.5",
				gap: "1",
				_icon: {
					width: "4",
					height: "4",
				},
			},
			sm: {
				h: "8",
				minW: "8",
				px: "0",
				textStyle: "sm",
				gap: "2",
				_icon: {
					width: "5",
					height: "5",
				},
			},
			md: {
				h: "10",
				minW: "10",
				textStyle: "sm",
				px: "4",
				gap: "2",
				_icon: {
					width: "6",
					height: "6",
				},
			},
			lg: {
				h: "11",
				minW: "11",
				textStyle: "md",
				px: "5",
				gap: "3",
				_icon: {
					width: "5",
					height: "5",
				},
			},
			xl: {
				h: "12",
				minW: "12",
				textStyle: "md",
				px: "5",
				gap: "2.5",
				_icon: {
					width: "5",
					height: "5",
				},
			},
			"2xl": {
				h: "16",
				minW: "16",
				textStyle: "lg",
				px: "7",
				gap: "3",
				_icon: {
					width: "6",
					height: "6",
				},
			},
		},
	},

	defaultVariants: {
		size: "sm",
	},
})

export default IconButton
