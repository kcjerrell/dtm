import {
	chakra,
	TabsContent,
	TabsIndicator,
	TabsList,
	TabsRoot,
	TabsTrigger,
} from "@chakra-ui/react"

const Root = chakra(TabsRoot, {
	base: {
		height: "100%",
		minHeight: 0,
		display: "flex !important",
		flexDirection: "column",
	},
})
const List = chakra(TabsList, {
	base: {
		height: "min",
		minHeight: "min",
		marginBottom: 0,
		borderBottom: "1px solid #77777722",
		alignItems: "center",
	},
})
const Trigger = chakra(TabsTrigger, {
	base: {
		py: 1.5,
		px: 2,
		color: "fg.3",
		fontSize: "sm",
		overflowY: "clip",
		_selected: {
			color: "highlight",
			bgColor: "bg.1",
			borderRadius: "5px 5px 0px 0px",
		},
		_before: { display: "none" },
		height: "min",
	},
})
const Indicator = chakra(TabsIndicator, {
	base: {
		bgColor: "highlight",
		border: "0px !important",
		borderBottom: "0px",
		height: "3px",
		bottom: "-1px",
		zIndex: 2,
	},
})
const Content = chakra(TabsContent, {
	base: {
		bgColor: "bg.2",
		// height: "100%",
		padding: 1,
		flex: "1 1 auto",
	},
})

const Tabs = {
	Root,
	Trigger,
	List,
	Content,
	Indicator,
}
export default Tabs
