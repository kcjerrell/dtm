import { chakra, defineRecipe } from "@chakra-ui/react"

export const LayoutRoot = chakra(
	"div",
	defineRecipe({
		base: {
			// position: "absolute",
			display: "flex",
			// width: "100%",
			justifyContent: "normal",
			alignItems: "stretch",
			gap: 0,
			overflowX: "clip",
			overscrollBehavior: "none none",
			flex: "1 1 auto",
			minWidth: 0,
			flexDirection: "row",
			overflowY: "clip",
			height: "100%",
		},
	}),
)

export const ContentPane = chakra(
	"div",
	defineRecipe({
		base: {
			display: "flex",
			flexDirection: "column",
			flex: "1 1 auto",
			padding: 0,
			alignItems: "stretch",
			justifyContent: "start",
			gap: 0,
			// minWidth: 0,
			overflow: "clip",
		},
	}),
)

export const InfoPaneContainer = chakra(
	"div",
	defineRecipe({
		base: {
			display: "flex",
			flexDirection: "column",
			padding: 0,
			margin: 2,
			borderRadius: "xl",
			boxShadow: "pane1",
			border: "pane1",
			flex: "0 0 20rem",
			gap: 0,
			alignItems: "stretch",
			overflow: "clip",
			bgColor: "bg.3",
			right: 0,
			marginLeft: "auto",
		},
	}),
)
