import { Box, createListCollection, type ListCollection } from "@chakra-ui/react"
import type { JSX } from "react"
import { capitalize } from "@/utils/helpers"
import ContentValueSelector from "./ContentValueSelector"
import FloatValueInput from "./FloatValueInput"
import IntValueInput from "./IntValueInput"
import { ControlValueSelector, LoraValueSelector, ModelValueSelector } from "./ModelValueSelector"
import SamplerValueSelector from "./SamplerValueSelector"

export function createValueLabelCollection(values: Record<string, string>) {
	return createListCollection({
		items: Object.entries(values).map(([value, label]) => ({ value, label })),
	})
}

export type FilterValueSelector<T = unknown> = ((props: ValueSelectorProps<T>) => JSX.Element) & {
	getValueLabel: T extends Array<infer _U> ? (value?: T) => string[] : (value: T) => string
}

export function getValueSelector(target?: string) {
	if (!target) return filterTargets.none.ValueComponent
	return filterTargets[target]?.ValueComponent
}
type CollectionItem = { value: string; label: string; plural?: string }
type CollectionType = ListCollection<CollectionItem>

const numberOps = [
	{ value: "eq", label: "=" },
	{ value: "neq", label: "≠" },
	{ value: "gt", label: ">" },
	{ value: "gte", label: ">=" },
	{ value: "lt", label: "<" },
	{ value: "lte", label: "<=" },
]
const numberOpsCollection = createListCollection({
	items: numberOps,
})

const isIsNotOps = [
	{ value: "is", label: "is", plural: "is in" },
	{ value: "isNot", label: "is not", plural: "is not in" },
]
const isIsNotOpsCollection = createListCollection({
	items: isIsNotOps,
})

const hasOps = [
	{ value: "has", label: "has" },
	{ value: "doesNotHave", label: "doesn't have" },
]
const hasOpsCollection = createListCollection({
	items: hasOps,
})

const allOps = [...numberOps, ...isIsNotOps, ...hasOps].reduce(
	(acc, op) => {
		acc[op.value] = op.label
		return acc
	},
	{} as Record<string, string>,
)

export function getOperatorLabel(op: string) {
	return allOps[op] || "?"
}

export const filterTargets = {
	model: { collection: isIsNotOpsCollection, ValueComponent: ModelValueSelector, initialValue: [] },
	lora: { collection: isIsNotOpsCollection, ValueComponent: LoraValueSelector, initialValue: [] },
	control: {
		collection: isIsNotOpsCollection,
		ValueComponent: ControlValueSelector,
		initialValue: [],
	},
	sampler: {
		collection: isIsNotOpsCollection,
		ValueComponent: SamplerValueSelector,
		initialValue: [],
		prepare: (value: string[]) => value.map((v) => Number(v)),
	},
	// refiner: { collection: isIsNotOpsCollection, ValueComponent: FilterValueInput },
	// upscaler: { collection: isIsNotOpsCollection, ValueComponent: FilterValueInput },
	content: { collection: hasOpsCollection, ValueComponent: ContentValueSelector, initialValue: [] },
	seed: { collection: numberOpsCollection, ValueComponent: IntValueInput, initialValue: 0 },
	steps: { collection: numberOpsCollection, ValueComponent: IntValueInput, initialValue: 20 },
	width: { collection: numberOpsCollection, ValueComponent: IntValueInput, initialValue: 1024 },
	height: { collection: numberOpsCollection, ValueComponent: IntValueInput, initialValue: 1024 },
	textGuidance: {
		collection: numberOpsCollection,
		ValueComponent: FloatValueInput,
		initialValue: 3.5,
	},
	shift: { collection: numberOpsCollection, ValueComponent: FloatValueInput, initialValue: 3.12 },
	none: {
		collection: createListCollection<CollectionItem>({ items: [] }),
		ValueComponent: Object.assign(
			(props: ValueSelectorProps<unknown>) => (
				<Box cursor={"default"} alignContent={"center"} {...props}>
					{/* <Text>
						...
					</Text> */}
				</Box>
			),
			{
				getValueLabel: () => "Unknown target",
			},
		),
	},
} as unknown as Record<
	string,
	{
		collection: CollectionType
		ValueComponent: FilterValueSelector<unknown>
		initialValue?: unknown
		prepare?: (value: unknown) => unknown
	}
>

export const targetCollection = createListCollection({
	items: Object.keys(filterTargets)
		.slice(0, -1)
		.map((t) => ({ value: t, label: capitalize(t) })),
})

export interface ValueSelectorProps<T> extends Omit<ChakraProps, "defaultValue" | "onSelect"> {
	value?: T
	onValueChange?: (value: T | undefined) => void
	target?: string
}
