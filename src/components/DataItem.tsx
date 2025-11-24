import { chakra, HStack } from "@chakra-ui/react"
import { motion } from "motion/react"
import { useLayoutEffect, useRef, useState } from "react"
import { prepData } from "@/metadata/infoPanel/DataItem"
import { getSampler, getSeedMode } from "@/utils/config"

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

	const [display, isObject, dataType] = prepData(data)

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
			<HStack>{label && <Label>{label}</Label>}</HStack>
			<Content
				type={dataType}
				ref={contentRef}
				collapse={getVariant(collapsible, collapsed)}
				maxHeight={maxHeight}
			>
				<motion.div layout>{display}</motion.div>
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
		wordBreak: "break-word",
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
				textIndent: "hanging each-line 2.5	rem",
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

const templates = {
	Size: (props: { width?: number; height?: number }) => {
		const { width, height, ...rest } = props
		if (!width || !height) return null

		return <DataItem label={"Size"} data={`${width} x ${height}`} {...rest} />
	},
	NumFrames: (props: { numFrames?: number }) => {
		const { numFrames, ...rest } = props
		if (!numFrames) return null
		return <DataItem label={"Num Frames"} data={numFrames} {...rest} />
	},
	Seed: (props: { seed?: number; seedMode?: number | string }) => {
		const { seed, seedMode, ...rest } = props
		if (!seed) return null

		return <DataItem label={"Seed"} data={`${seed} (${getSeedMode(seedMode)})`} {...rest} />
	},
	Model: (props: { model?: string }) => {
		const { model, ...rest } = props
		if (!model) return null
		return <DataItem label={"Model"} data={model} {...rest} />
	},
	Steps: (props: { steps?: number }) => {
		const { steps, ...rest } = props
		if (!steps) return null
		return <DataItem label={"Steps"} data={steps} {...rest} />
	},
	Sampler: (props: { sampler?: number | string; stochasticSamplingGamma?: number }) => {
		const { sampler, stochasticSamplingGamma, ...rest } = props
		if (!sampler) return null
		const samplerName = getSampler(sampler)
		let data = samplerName
		if (samplerName === "TCD" && stochasticSamplingGamma !== undefined) {
			data += ` (${(stochasticSamplingGamma * 100).toFixed(0)}%)`
		}

		return <DataItem label={"Sampler"} data={data} {...rest} />
	},
	Refiner: (props: { refinerModel?: string; refinerStart?: number }) => {
		const { refinerModel, refinerStart, ...rest } = props
		if (!refinerModel) return null
		const start =
			refinerStart !== undefined ? ` (${(refinerStart * 100).toFixed(1)}%)` : ""
		return (
			<DataItem label={"Refiner"} data={`${refinerModel}${start}`} {...rest} />
		)
	},
	Shift: (props: { shift?: number; resolutionDependentShift?: boolean }) => {
		const { shift, resolutionDependentShift, ...rest } = props
		if (shift === undefined) return null
		let data = shift.toFixed(2)
		if (resolutionDependentShift) {
			data += " (Res. Dependent)"
		}
		return <DataItem label={"Shift"} data={data} {...rest} />
	},
	GuidanceEmbed: (props: {
		guidanceEmbed?: number
		speedUpWithGuidanceEmbed?: boolean
	}) => {
		const { guidanceEmbed, speedUpWithGuidanceEmbed, ...rest } = props
		if (speedUpWithGuidanceEmbed !== false || guidanceEmbed === undefined)
			return null
		return <DataItem label={"Guidance Embed"} data={guidanceEmbed} {...rest} />
	},
	CausalInference: (props: {
		causalInferenceEnabled?: boolean
		causalInference?: number
		causalInferencePad?: number
	}) => {
		const {
			causalInferenceEnabled,
			causalInference,
			causalInferencePad,
			...rest
		} = props
		if (!causalInferenceEnabled) return null
		return (
			<DataItem
				label={"Causal Inference"}
				data={`True (${causalInference}-${causalInferencePad})`}
				{...rest}
			/>
		)
	},
	CfgZeroStar: (props: { cfgZeroStar?: boolean; cfgZeroInitSteps?: number }) => {
		const { cfgZeroStar, cfgZeroInitSteps, ...rest } = props
		if (!cfgZeroStar) return null
		return (
			<DataItem
				label={"CFG Zero Star"}
				data={`True (${cfgZeroInitSteps} steps)`}
				{...rest}
			/>
		)
	},
	Strength: (props: { strength?: number }) => {
		const { strength, ...rest } = props
		if (!strength) return null
		const percent = strength <= 1 ? strength * 100 : strength
		const displayValue = percent.toFixed(1)

		return <DataItem label={"Strength"} data={`${displayValue}%`} {...rest} />
	},
	GuidanceScale: (props: { guidanceScale?: number }) => {
		const { guidanceScale, ...rest } = props
		if (!guidanceScale) return null
		return <DataItem label={"Guidance Scale"} data={guidanceScale.toFixed(1)} {...rest} />
	},
	MaskBlur: (props: { maskBlur?: number }) => {
		const { maskBlur, ...rest } = props
		if (!maskBlur) return null
		return <DataItem label={"Mask Blur"} data={maskBlur.toFixed(1)} {...rest} />
	},
	MaskBlurOutset: (props: { maskBlurOutset?: number }) => {
		const { maskBlurOutset, ...rest } = props
		if (!maskBlurOutset) return null
		return <DataItem label={"Mask Blur Outset"} data={maskBlurOutset} {...rest} />
	},
	Sharpness: (props: { sharpness?: number }) => {
		const { sharpness, ...rest } = props
		if (!sharpness) return null
		return <DataItem label={"Sharpness"} data={sharpness.toFixed(1)} {...rest} />
	},
	TiledDecoding: (props: {
		tiledDecoding?: boolean
		decodingTileHeight?: number
		decodingTileOverlap?: number
		decodingTileWidth?: number
	}) => {
		const {
			tiledDecoding,
			decodingTileHeight,
			decodingTileOverlap,
			decodingTileWidth,
			...rest
		} = props
		if (!tiledDecoding) return null
		return (
			<DataItem
				label={"Tiled Decoding"}
				data={`${decodingTileWidth} x ${decodingTileHeight} (${decodingTileOverlap} overlap)`}
				{...rest}
			/>
		)
	},
	TiledDiffusion: (props: {
		tiledDiffusion?: boolean
		diffusionTileHeight?: number
		diffusionTileOverlap?: number
		diffusionTileWidth?: number
	}) => {
		const {
			tiledDiffusion,
			diffusionTileHeight,
			diffusionTileOverlap,
			diffusionTileWidth,
			...rest
		} = props
		if (!tiledDiffusion) return null
		return (
			<DataItem
				label={"Tiled Diffusion"}
				data={`${diffusionTileWidth} x ${diffusionTileHeight} (${diffusionTileOverlap} overlap)`}
				{...rest}
			/>
		)
	},
	HiresFix: (props: {
		hiresFix?: boolean
		hiresFixHeight?: number
		hiresFixStrength?: number
		hiresFixWidth?: number
	}) => {
		const {
			hiresFix,
			hiresFixHeight,
			hiresFixStrength,
			hiresFixWidth,
			...rest
		} = props
		if (!hiresFix) return null
		return (
			<DataItem
				label={"Hires Fix"}
				data={`${hiresFixWidth} x ${hiresFixHeight} at ${((hiresFixStrength ?? 0) * 100).toFixed(0)}%`}
				{...rest}
			/>
		)
	},
	ClipL: (props: { separateClipL?: boolean; clipLText?: string }) => {
		const { separateClipL, clipLText, ...rest } = props
		if (!separateClipL) return null
		return <DataItem label={"Clip L"} data={clipLText} {...rest} />
	},
	OpenClipG: (props: { separateOpenClipG?: boolean; openClipGText?: string }) => {
		const { separateOpenClipG, openClipGText, ...rest } = props
		if (!separateOpenClipG) return null
		return <DataItem label={"Open Clip G"} data={openClipGText} {...rest} />
	},
	T5: (props: { separateT5?: boolean; t5Text?: string }) => {
		const { separateT5, t5Text, ...rest } = props
		if (!separateT5) return null
		return <DataItem label={"T5"} data={t5Text} {...rest} />
	},
	TeaCache: (props: {
		teaCache?: boolean
		teaCacheEnd?: number
		teaCacheMaxSkipSteps?: number
		teaCacheStart?: number
		teaCacheThreshold?: number
	}) => {
		const {
			teaCache,
			teaCacheEnd,
			teaCacheMaxSkipSteps,
			teaCacheStart,
			teaCacheThreshold,
			...rest
		} = props
		if (!teaCache) return null
		return (
			<DataItem
				label={"Tea Cache"}
				data={{
					Threshold: teaCacheThreshold,
					Start: teaCacheStart,
					End: teaCacheEnd,
					"Max Skip": teaCacheMaxSkipSteps,
				}}
				{...rest}
			/>
		)
	},
	Upscaler: (props: { upscaler?: string; upscalerScaleFactor?: number }) => {
		const { upscaler, upscalerScaleFactor, ...rest } = props
		if (!upscaler) return null
		let data = upscaler
		if (upscalerScaleFactor) {
			data += ` (${upscalerScaleFactor.toFixed(1)}x)`
		}
		return <DataItem label={"Upscaler"} data={data} {...rest} />
	},
}

const ex = DataItem as typeof DataItem & typeof templates
Object.assign(ex, templates)

export default ex
