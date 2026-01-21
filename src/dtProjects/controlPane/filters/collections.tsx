import { Box, createListCollection, type ListCollection } from "@chakra-ui/react"
import type { JSX } from "react"
import type { Model } from "@/commands"
import { isVersionModel, type VersionModel } from "@/dtProjects/types"
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

export type FilterValueSelector<T = unknown> = (props: ValueSelectorProps<T>) => JSX.Element

export function getValueSelector(target?: string) {
    if (!target) return filterTargets.none.ValueComponent
    return filterTargets[target as keyof typeof filterTargets]?.ValueComponent
}
type CollectionItem = { value: string; label: string; plural?: string }
type CollectionType = ListCollection<CollectionItem>

const numberOps: CollectionItem[] = [
    { value: "eq", label: "=" },
    { value: "neq", label: "≠" },
    { value: "gt", label: ">" },
    { value: "gte", label: ">=" },
    { value: "lt", label: "<" },
    { value: "lte", label: "<=" },
]
const numberOpsCollection: CollectionType = createListCollection({
    items: numberOps,
})

const isIsNotOps: CollectionItem[] = [
    { value: "is", label: "is", plural: "is in" },
    { value: "isnot", label: "is not", plural: "is not in" },
]
const isIsNotOpsCollection: CollectionType = createListCollection({
    items: isIsNotOps,
})

const hasOps: CollectionItem[] = [
    { value: "has", label: "has" },
    { value: "hasall", label: "has all" },
    { value: "doesnothave", label: "doesn't have" },
]
const hasOpsCollection: CollectionType = createListCollection({
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

const prepareModelFilterValue = (value: (Model | VersionModel)[]) => {
    return value.flatMap((m) => {
        if (isVersionModel(m)) return m.modelIds
        return m.id
    })
}
const prepareSizeFilterValue = (value: number) => Math.round(value / 64)

export const filterTargets = {
    model: {
        collection: isIsNotOpsCollection,
        ValueComponent: ModelValueSelector,
        initialValue: [],
        prepare: prepareModelFilterValue,
    },
    lora: {
        collection: isIsNotOpsCollection,
        ValueComponent: LoraValueSelector,
        initialValue: [],
        prepare: prepareModelFilterValue,
    },
    control: {
        collection: isIsNotOpsCollection,
        ValueComponent: ControlValueSelector,
        initialValue: [],
        prepare: prepareModelFilterValue,
    },
    sampler: {
        collection: isIsNotOpsCollection,
        ValueComponent: SamplerValueSelector,
        initialValue: [],
        prepare: (value: string[]) => value.map((v) => Number(v)),
    } as FilterImplementation<string[]>,
    // refiner: { collection: isIsNotOpsCollection, ValueComponent: FilterValueInput },
    // upscaler: { collection: isIsNotOpsCollection, ValueComponent: FilterValueInput },
    content: {
        collection: hasOpsCollection,
        ValueComponent: ContentValueSelector,
        initialValue: [],
    },
    seed: { collection: numberOpsCollection, ValueComponent: IntValueInput, initialValue: 0 },
    steps: { collection: numberOpsCollection, ValueComponent: IntValueInput, initialValue: 20 },
    width: {
        collection: numberOpsCollection,
        ValueComponent: IntValueInput,
        initialValue: 1024,
        prepare: prepareSizeFilterValue,
    } as FilterImplementation<number>,
    height: {
        collection: numberOpsCollection,
        ValueComponent: IntValueInput,
        initialValue: 1024,
        prepare: prepareSizeFilterValue,
    } as FilterImplementation<number>,
    textGuidance: {
        collection: numberOpsCollection,
        ValueComponent: FloatValueInput,
        initialValue: 3.5,
    } as FilterImplementation<number>,
    shift: { collection: numberOpsCollection, ValueComponent: FloatValueInput, initialValue: 3.12 },
    none: {
        collection: createListCollection<CollectionItem>({ items: [] }),
        ValueComponent: (props: ValueSelectorProps<unknown>) => {
            const { onValueChange, ...restProps } = props
            return (
                <Box cursor={"default"} alignContent={"center"} {...restProps}>
                    {/* <Text>
						...
					</Text> */}
                </Box>
            )
        },
    } as FilterImplementation<unknown>,
} as unknown as Record<string, FilterImplementation>

type FilterImplementation<T = unknown> = {
    collection: CollectionType
    ValueComponent: FilterValueSelector<T>
    initialValue?: T
    prepare?: (value: T) => unknown
}

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
