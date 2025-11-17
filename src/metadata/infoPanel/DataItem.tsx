import { Box, chakra, GridItem, HStack } from "@chakra-ui/react"
import { useCallback } from "react"
import { useMeasureGrid } from "@/components/measureGrid/useMeasureGrid"
import { useTimedState } from "@/hooks/useTimedState"

interface DataItemProps<T> extends ChakraProps {
	label: string
	data: T
	cols?: number
	ignore?: boolean
	decimalPlaces?: number
	onCollapseChange?: (collapsed: "collapsed" | "expanded") => void
	initialCollapse?: "collapsed" | "expanded"
	expanded?: boolean
	onClick?: (e: React.MouseEvent, data: T, label: string) => void
}

function DataItem(props: DataItemProps<unknown>) {
	const {
		data,
		label,
		cols,
		decimalPlaces,
		ignore,
		onCollapseChange,
		initialCollapse,
		onClick,
		expanded,
		...rest
	} = props
	const [justCopied, setJustCopied] = useTimedState(false, 1000)

	const [content, forceSpan, type] = prepData(data, { decimalPlaces })
	const { collapse, span, maxHeight, toggleCollapsed } = useMeasureGrid(content, {
		forceSpan,
		expanded,
		initialCollapse,
		onCollapseChange,
	})
	const colSpan = cols ?? span
	const gridColumn = colSpan > 1 ? `1 / span ${colSpan}` : undefined

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			if (onClick) {
				onClick(e, data, label)
			} else {
				setJustCopied(true)
				navigator.clipboard.writeText(content ?? "")
			}
		},
		[setJustCopied, content, data, label, onClick],
	)

	if (ignore) return null

	return (
		<Root gridColumn={gridColumn} {...rest}>
			{/* <VStack gap={0}> */}
			<HStack justifyContent={"space-between"}>
				<Box
					paddingLeft={0.5}
					fontWeight={500}
					fontSize={"xs"}
					color={"fg.1"}
					overflow={"clip"}
					textOverflow={"ellipsis"}
				>
					{justCopied ? "Copied!" : label}
				</Box>
			</HStack>
			<Content
				className={"peer"}
				collapse={collapse}
				type={type}
				onClick={handleClick}
				maxHeight={maxHeight}
			>
				{content}
			</Content>
			{collapse !== "normal" && (
				<Box
					fontSize={"xs"}
					color={"fg.2"}
					onClick={() => toggleCollapsed()}
					position={"absolute"}
					bottom={0}
					right={0}
					paddingLeft={"2.5rem"}
					paddingTop={"1rem"}
					fontWeight={600}
					_hover={{ color: "fg.1" }}
					bgImage={
						"radial-gradient(farthest-side at bottom right,  var(--chakra-colors-bg-1) 50%, #00000000 100%); "
					}
					_peerHover={{
						bgImage:
							"radial-gradient(farthest-side at bottom right,  var(--chakra-colors-bg-2) 50%, #00000000 100%);",
					}}
				>
					{collapse === "collapsed" ? "(more)" : "(less)"}
				</Box>
			)}
		</Root>
	)
}

export default DataItem

const Root = chakra("div", {
	base: {
		position: "relative",
		display: "flex",
		flexDirection: "column",
		alignItems: "stretch",
	},
})

const ExpandButton = chakra("div", {
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
})

const Content = chakra("div", {
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
			transform: "translateY(-1px)",
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
})

type PrepDataOpts = {
	decimalPlaces?: number
}
type PrepDataTypes = "string" | "number" | "boolean" | "array" | "object" | "null" | "undefined"

export function prepData(
	data: unknown,
	opts?: PrepDataOpts,
): [string | null, boolean, PrepDataTypes] {
	if (Array.isArray(data)) return [null, true, "array"]
	if (typeof data === "number") {
		if (opts?.decimalPlaces === undefined && isInt(data))
			return [String(Math.round(data)), false, "number"]
		return [data.toFixed(opts?.decimalPlaces ?? 2), false, "number"]
	}
	if (typeof data === "boolean") return [String(data), false, "boolean"]
	if (typeof data === "string") {
		const text = decodeHtmlEntities(data)
		if (
			(text.startsWith("{") && text.endsWith("}")) ||
			(text.startsWith("[") && text.endsWith("]"))
		) {
			try {
				return prepData(JSON.parse(text), opts)
			} catch {}
			try {
				const cleaned = text
					.replace(/\bNaN\b/g, "null")
					.replace(/\bInfinity\b/g, "null")
					.replace(/\b-?Infinity\b/g, "null")
					.replace(/\bundefined\b/g, "null")

				return prepData(JSON.parse(cleaned), opts)
			} catch {}
		}
		return [text, false, "string"]
	}
	if (data === null) return ["undefined", false, "null"]
	if (data === undefined) return ["undefined", false, "undefined"]
	if (typeof data === "object") {
		if ("lang" in data && data.lang === "x-default" && "value" in data)
			return prepData(data.value, opts)
		return [JSON.stringify(data, null, 2), true, "object"]
	}

	return [null, false, "null"]
}

function isInt(value: number, epsilon = 0.000001) {
	return Math.abs(Math.round(value) - value) < epsilon
}

function decodeHtmlEntities(str: string) {
	const parser = new DOMParser()
	const doc = parser.parseFromString(str, "text/html")
	return doc.documentElement.textContent
}
