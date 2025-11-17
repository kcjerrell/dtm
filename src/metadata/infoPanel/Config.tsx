import { Box, HStack } from "@chakra-ui/react"
import MeasureGrid, { MeasureGridProps } from "@/components/measureGrid/MeasureGrid"
import type { ImageItem } from "../state/ImageItem"
import DataItem from "./DataItem"
import { DrawThingsMetaData } from '@/types'

interface ConfigProps extends MeasureGridProps {
	imageSnap?: ReadonlyState<ImageItem>
	expandItems?: string[]
	onItemCollapseChanged?: (key: string, collapse: "collapsed" | "expanded") => void
	dtData?: DrawThingsMetaData
}

function Config(props: ConfigProps) {
	const { imageSnap, expandItems, onItemCollapseChanged, dtData: dtDataProp, ...rest } = props
	const dtData = dtDataProp ?? imageSnap?.dtData

	if (!dtData)
		return (
			<Box
				width={"100%"}
				justifySelf={"center"}
				fontSize={"md"}
				textAlign={"center"}
				color={"fg.1"}
			>
				Image has no Draw Things data
			</Box>
		)

	return (
		<MeasureGrid columns={2} gap={1} fontSize={"xs"} maxItemLines={6} padding={1} {...rest}>
			<DataItem
				label={"Size"}
				data={`${dtData?.config?.width} x ${dtData?.config?.height}`}
				ignore={dtData?.config?.width === undefined || dtData?.config?.height === undefined}
			/>
			<DataItem label={"Seed"} data={dtData?.config?.seed} decimalPlaces={0} />
			{null}
			<DataItem label={"Model"} data={dtData?.config?.model} cols={2} />
			<DataItem label={"Sampler"} data={samplerLabels[dtData?.config?.sampler]} cols={2} />
			<HStack gridColumn={"span 2"} width={"100%"} justifyContent={"space-between"}>
				<DataItem
					label={"Steps"}
					data={dtData?.config?.steps}
					decimalPlaces={0}
					flex={"1 1 min-content"}
				/>
				<DataItem
					label={"ImageGuidance"}
					data={dtData?.config?.imageGuidanceScale}
					decimalPlaces={1}
					flex={"1 1 min-content"}
				/>
				<DataItem
					label={"Shift"}
					data={dtData?.config?.shift}
					decimalPlaces={2}
					flex={"3 0 min-content"}
				/>
			</HStack>
			<DataItem
				label={"Prompt"}
				data={dtData?.prompt}
				cols={2}
				initialCollapse={expandItems?.includes("prompt") ? "expanded" : "collapsed"}
				onCollapseChange={(c) => onItemCollapseChanged?.("prompt", c)}
			/>
			<DataItem
				label={"Negative Prompt"}
				data={dtData?.negativePrompt}
				cols={2}
				initialCollapse={expandItems?.includes("negativePrompt") ? "expanded" : "collapsed"}
				onCollapseChange={(c) => onItemCollapseChanged?.("negativePrompt", c)}
			/>
			<DataItem
				label={"Config"}
				data={dtData?.config}
				cols={2}
				initialCollapse={"expanded"}
				onCollapseChange={(c) => onItemCollapseChanged?.("config", c)}
			/>
		</MeasureGrid>
	)
}

export default Config

const samplerLabels = [
	"DPM++ 2M Karras",
	"Euler A",
	"DDIM",
	"PLMS",
	"DPM++ SDE Karras",
	"UniPC",
	"LCM",
	"Euler A Substep",
	"DPM++ SDE Substep",
	"TCD",
	"Euler A Trailing",
	"DPM++ SDE Trailing",
	"DPM++ 2M AYS",
	"Euler A AYS",
	"DPM++ SDE AYS",
	"DPM++ 2M Trailing",
	"DDIM Trailing",
	"UniPC Trailing",
	"UniPC AYS",
]
