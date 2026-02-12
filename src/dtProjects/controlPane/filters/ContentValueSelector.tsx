import { Select, Text, VStack } from "@chakra-ui/react"
import {
	createValueLabelCollection,
	type FilterValueSelector,
	type ValueSelectorProps,
} from "./collections"
import FilterSelect from "./FilterSelect"

const contentValues = {
	mask: "Mask",
	depth: "Depth map",
	pose: "Pose",
	color: "Color palette",
	custom: "Custom",
	scribble: "Scribble",
	shuffle: "Moodboard",
} as const

const contentCollection = createValueLabelCollection(contentValues)

function ContentValueSelectorComponent(props: ValueSelectorProps<string[]>) {
	const { value, onValueChange, ...boxProps } = props

	return (
		<FilterSelect.Root
			flex={"1 1 auto"}
			collection={contentCollection}
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
								{contentValues[value as keyof typeof contentValues] ?? "unknown"}
							</Text>
						))}
						{value?.length === 0 && <Text key="empty">Select content</Text>}
					</VStack>
				</FilterSelect.Trigger>
			</FilterSelect.Control>
			<FilterSelect.ContentWrapper>
				{contentCollection.items.map((item) => (
					<Select.Item item={item} key={item.value}>
						{item.label}
						<Select.ItemIndicator />
					</Select.Item>
				))}
			</FilterSelect.ContentWrapper>
		</FilterSelect.Root>
	)
}

const ContentValueSelector = ContentValueSelectorComponent as FilterValueSelector<string[]>

ContentValueSelector.getValueLabel = (values: string | string[]) => {
	const valueArray = Array.isArray(values) ? values : [values]
	return valueArray.map((v) =>
		v in contentValues ? contentValues[v as keyof typeof contentValues] : "unknown",
	)
}

export default ContentValueSelector
