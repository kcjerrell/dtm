import { Box, Button, chakra, HStack, VStack } from "@chakra-ui/react"
import { proxy, useSnapshot } from "valtio"
import { CheckRoot } from "@/components"
import { Panel } from "@/components/common"
import VirtualizedList from "@/components/virtualizedList/VirtualizedList"
import { useEffect, useState } from "react"
import { DotSpinner } from "@/components/preview"

const store = proxy({
	someState: "Hello",
	items: Array.from({ length: 2000 }, () => randWord(10)),
	selected: false,
})

function randWord(length: number) {
	return Array.from({ length }, () =>
		String.fromCharCode((Math.random() < 0.5 ? 65 : 97) + Math.floor(Math.random() * 26)),
	).join("")
}

function VList(props) {
	const snap = useSnapshot(store)

	const bsa =
		"0px 1px 4px -2px #00000033, 2px 4px 6px -2px #00000022, -1px 4px 6px -2px #00000022,  0px 3px 12px -3px #00000033"
	const bsb =
		"0px 1px 4px -1px #00000044, 2px 6px 10px -4px #00000022, -1px 6px 10px -4px #00000022, 0px 4px 16px -4px #00000044"

	return (
		<CheckRoot
			width={"full"}
			height={"full"}
			alignItems={"center"}
			justifyContent={"space-evenly"}
			padding={8}
		>
			<Panel width={"50%"} height={"100%"}>
				<Box bgColor={"bg.1"} padding={8} borderRadius={"lg"} boxShadow={bsa}>
					<Box bgColor={"bg.2"} padding={8} borderRadius={"lg"} boxShadow={bsb}>
						<Box bgColor={"bg.3"} padding={8} borderRadius={"lg"} boxShadow={bsa}>
							<DotSpinner width={"20vh"} height={"20vh"} />
						</Box>
					</Box>
				</Box>

				{/* <VirtualizedList
					estimatedItemSize={35}
					items={snap.items}
					itemComponent={Item}
					keyFn={(item, index) => item}
				/> */}
			</Panel>

			<VStack>
				{/* <Panel>
					<Box bgColor={"bg.1"} padding={8} borderRadius={"lg"} boxShadow={bsa}>
						<Box bgColor={"bg.2"} padding={8} borderRadius={"lg"} boxShadow={bsb}>
							<Box bgColor={"bg.3"} padding={8} borderRadius={"lg"} boxShadow={bsa}>
								Content
							</Box>
						</Box>
					</Box>
				</Panel> */}
				<Panel>
					<PanelSectionHeader>A List Of Things</PanelSectionHeader>
					<ListContainer width={"18rem"} height={"15rem"}>
						<PanelListItem selectable>Content First Item </PanelListItem>
						<PanelListItem
							selectable
							selected={snap.selected}
							onClick={() => {
								store.selected = !store.selected
							}}
						>
							Content Some Item
						</PanelListItem>
						<PanelListItem selectable selected>
							Content Last Item
						</PanelListItem>
					</ListContainer>
					<HStack>
						<PanelButton>Add</PanelButton>
						<PanelButton>Remove</PanelButton>
					</HStack>
					<Box>An explanation of a thing with some text</Box>
				</Panel>
			</VStack>
		</CheckRoot>
	)
}

const PanelButton = chakra(
	Button,
	{
		base: {
			bgColor: "bg.1/20",
			color: "fg.2",
			height: "min-content",
			paddingY: 2,
			_hover: {
				border: "1px solid {colors.fg.2/20}",
				boxShadow: "0px 1px 5px -3px #00000055",
				bgColor: "bg.2/50",
			}
		},
	},
	{ defaultProps: { size: "sm", variant: "subtle" } },
)

const PanelListItem = chakra(
	"div",
	{
		base: {
			bgColor: "bg.2",
			color: "fg.2",
			paddingX: 2,
			paddingY: 1,
			borderRadius: 0,
			borderBlock: "1px solid #00000033",
			boxShadow: "0px 0px 18px -8px #00000022",
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
					bgImage: "linear-gradient(to left, {colors.blue.500/30}, {colors.blue.500/40})",
					// bgColor: "bg.1"
					color: "fg.1",
				},
			},
		},
	},
	{ defaultProps: { tabIndex: 0 } },
)

const ListContainer = (props) => {
	const { children, ...restProps } = props
	return (
		<ListWrapper {...restProps}>
			<PaneListContainer>{children}</PaneListContainer>
		</ListWrapper>
	)
}

const ListWrapper = chakra("div", {
	base: {
		position: "relative",
	},
})

const PaneListContainer = chakra("div", {
	base: {
		bgColor: "bg.deep",
		height: "100%",
		width: "100%",
		color: "fg.2",
		paddingY: 1,
		paddingX: 1,
		// borderInline:"2px solid {colors.bg.deep}",
		borderRadius: 0,
		gap: 1,
		display: "flex",
		justifyContent: "flex-start",
		alignItems: "stretch",
		flexDirection: "column",
		// boxShadow: "0px 0px 30px 0px #00000088 inset",
		// border: "1px solid #00000055",
	},
})

const PanelSectionHeader = chakra("h3", {
	base: {
		paddingX: 2,
		fontWeight: "600",
		color: "fg.2",
	},
})

export default VList
