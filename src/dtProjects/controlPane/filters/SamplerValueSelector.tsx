import { Select, Text, VStack } from "@chakra-ui/react"
import {
	createValueLabelCollection,
	type FilterValueSelector,
	type ValueSelectorProps,
} from "./collections"
import FilterSelect from "./FilterSelect"

const samplerValues = {
	"0": "DPMPP2MKarras",
	"1": "EulerA",
	"2": "DDIM",
	"3": "PLMS",
	"4": "DPMPPSDEKarras",
	"5": "UniPC",
	"6": "LCM",
	"7": "EulerASubstep",
	"8": "DPMPPSDESubstep",
	"9": "TCD",
	"10": "EulerATrailing",
	"11": "DPMPPSDETrailing",
	"12": "DPMPP2MAYS",
	"13": "EulerAAYS",
	"14": "DPMPPSDEAYS",
	"15": "DPMPP2MTrailing",
	"16": "DDIMTrailing",
	"17": "UniPCTrailing",
	"18": "UniPCAYS",
} as const

const samplerCollection = createValueLabelCollection(samplerValues)

function SamplerValueSelectorComponent(props: ValueSelectorProps<string[]>) {
	const { value, onValueChange, ...boxProps } = props

	return (
		<FilterSelect.Root
			flex={"1 1 auto"}
			collection={samplerCollection}
			value={value}
			onValueChange={(value) => {
				onValueChange?.(value.value as string[])
			}}
			multiple={true}
			{...boxProps}
		>
			<FilterSelect.Control>
				<FilterSelect.Trigger>
					<VStack width={"full"} alignItems={"stretch"}>
						{value?.map((value) => (
							<Text key={value}>
								{samplerValues[value as keyof typeof samplerValues] ?? "unknown"}
							</Text>
						))}
						{value?.length === 0 && <Text key="empty">Select sampler</Text>}
					</VStack>
				</FilterSelect.Trigger>
			</FilterSelect.Control>
			<FilterSelect.ContentWrapper>
				{samplerCollection.items.map((item) => (
					<Select.Item item={item} key={item.value}>
						{item.label}
						<Select.ItemIndicator />
					</Select.Item>
				))}
			</FilterSelect.ContentWrapper>
		</FilterSelect.Root>
	)
}

const SamplerValueSelector = SamplerValueSelectorComponent as FilterValueSelector<string[]>

SamplerValueSelector.getValueLabel = (values) => {
	if (!values) return ["(None selected)"]
	return values.map((value) => samplerValues[value as keyof typeof samplerValues] ?? "unknown")
}

export default SamplerValueSelector
