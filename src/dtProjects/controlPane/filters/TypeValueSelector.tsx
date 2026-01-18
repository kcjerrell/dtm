import { Select, Text, VStack } from "@chakra-ui/react"
import {
    createValueLabelCollection,
    type FilterValueSelector,
    type ValueSelectorProps,
} from "./collections"
import FilterSelect from "./FilterSelect"

const typeValues = {
    image: "Image",
    video: "Video",
} as const

const typeValuesCollection = createValueLabelCollection(typeValues)

function TypeValueSelectorComponent(props: ValueSelectorProps<string[]>) {
    const { value, onValueChange, ...boxProps } = props

    return (
        <FilterSelect.Root
            flex={"1 1 auto"}
            collection={typeValuesCollection}
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
                                {typeValues[value as keyof typeof typeValues] ?? "unknown"}
                            </Text>
                        ))}
                        {value?.length === 0 && <Text key="empty">Select type</Text>}
                    </VStack>
                </FilterSelect.Trigger>
            </FilterSelect.Control>
            <FilterSelect.ContentWrapper>
                {typeValuesCollection.items.map((item) => (
                    <Select.Item item={item} key={item.value}>
                        {item.label}
                        <Select.ItemIndicator />
                    </Select.Item>
                ))}
            </FilterSelect.ContentWrapper>
        </FilterSelect.Root>
    )
}

const TypeValueSelector = TypeValueSelectorComponent as FilterValueSelector<string[]>

TypeValueSelector.getValueLabel = (values) => {
    if (!Array.isArray(values)) return []
    return values.map((v) =>
        v in typeValues ? typeValues[v as keyof typeof typeValues] : "unknown",
    )
}

export default TypeValueSelector
