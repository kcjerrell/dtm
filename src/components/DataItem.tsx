import { prepData } from '@/metadata/infoPanel/DataItem'
import { chakra, HStack } from "@chakra-ui/react"
import { motion } from "motion/react"
import { useLayoutEffect, useRef, useState } from "react"

interface DataItemProps extends ChakraProps {
	label?: string
	maxLines?: number
	data?: unknown
}

function DataItem(props: DataItemProps) {
	const { data, label, maxLines, ...rest } = props

	const [collapsible, setCollapsible] = useState(false)
	const [collapsed, setCollapsed] = useState(false)
	const [maxHeight, setMaxHeight] = useState("unset")

	const contentRef = useRef<HTMLDivElement>(null)

	useLayoutEffect(() => {
		if (!contentRef.current || !maxLines) return
		const style = getComputedStyle(contentRef.current)
		let lineHeight = parseFloat(style.lineHeight)
		if (Number.isNaN(lineHeight)) {
			// fallback: compute from font size if "normal"
			const fontSize = parseFloat(style.fontSize)
			lineHeight = fontSize * 1.2 // approximate
		}

		const height = contentRef.current.clientHeight
		const lines = height / lineHeight
		if (height > lineHeight * maxLines) {
			setCollapsible(true)
			setCollapsed(true)
			setMaxHeight(`${lineHeight * maxLines}px`)
		}
	}, [maxLines])

	if (!data) return null

	return (
		<Root {...rest}>
			<HStack>
				{label && <Label>{label}</Label>}
			</HStack>
			<Content ref={contentRef} collapse={getVariant(collapsible, collapsed)} maxHeight={maxHeight}>
				<motion.div layout>{prepData(data)}</motion.div>
			</Content>
			{collapsible && (
				<ExpandButton onClick={() => setCollapsed(!collapsed)}>
					{collapsed ? "Expand" : "Collapse"}
				</ExpandButton>
			)}
		</Root>
	)
}

function getVariant(collapsible: boolean, collapsed: boolean) {
	if (!collapsible) return "normal"
	if (collapsed) return "collapsed"
	return "expanded"
}

const Root = chakra(
	motion.div,
	{
		base: {
			position: "relative",
			display: "flex",
			flexDirection: "column",
			alignItems: "stretch",
		},
	},
	{ defaultProps: { layout: true } },
)

const Label = chakra(
	motion.div,
	{
		base: {
			paddingLeft: 0.5,
			fontWeight: 500,
			fontSize: "xs",
			color: "fg.1",
			overflow: "clip",
			textOverflow: "ellipsis",
		},
	},
	{ defaultProps: { layout: true } },
)

const ExpandButton = chakra(
	motion.div,
	{
		base: {
			fontSize: "xs",
			color: "fg.2",
			position: "absolute",
			bottom: 0,
			right: 0,
			pl: "2.5rem",
			pt: "1rem",
			fontWeight: 600,
			bgImage:
				"radial-gradient(farthest-side at bottom right, var(--chakra-colors-bg-1) 50%, #00000000 100%)",
			_hover: {
				color: "fg.1",
			},
			_peerHover: {
				bgImage:
					"radial-gradient(farthest-side at bottom right, var(--chakra-colors-bg-2) 50%, #00000000 100%)",
			},
		},
	},
	{ defaultProps: { layout: true } },
)

const Content = chakra(
	"div",
	{
		base: {
			outline: "1px solid transparent",
			padding: "2px",
			border: "1px solid transparent",
			color: "fg.2",
			overflowX: "clip",
			overflowY: "clip",
			minWidth: 0,
			whiteSpace: "pre-wrap",
			borderRadius: "sm",
			_dark: {
				_hover: {
					bgColor: "bg.3",
				},
			},
			fontSize: "sm",
			_hover: {
				// boxShadow: "0px 1px 2px -1px #00000055, 0px 2px 6px -2px #00000022",
				boxShadow: "2px 2px 4px -2px #00000055, -2px 2px 4px -2px #00000055",
				// transform: "translateY(-1px)",
				bgColor: "bg.2",
				transition:
					"box-shadow 0.1s ease-in-out, transform 0.1s ease-in-out, background-color 0.1s ease-in-out",
			},
			transition:
				"box-shadow 0.3s ease-in-out, transform 0.3s ease-in-out, background-color 0.3s ease-in-out",
			_selection: {
				bgColor: "info/50",
			},
		},
		variants: {
			collapse: {
				collapsed: {
					marginBottom: 0.5,
					_after: {
						content: '""',
						position: "absolute",
						height: "2rem",
						backgroundImage: "linear-gradient(0deg, var(--chakra-colors-bg-1) 0%, #00000000 100%)",
						bottom: "2px",
						right: 0,
						left: 0,
					},
				},
				expanded: {
					maxHeight: "min-content !important",
					paddingBattom: "1rem",
				},
				normal: {},
			},
			type: {
				object: {
					textIndent: "1rem hanging each-line",
					fontFamily: "monospace",
					fontSize: "0.8rem",
				},
				string: {},
				number: {},
				boolean: {},
				array: {},
				null: {},
				undefined: {},
			},
		},
	},
	{ defaultProps: { layout: true } },
)

export default DataItem
