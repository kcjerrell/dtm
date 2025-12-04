import { chakra, Portal, Select } from "@chakra-ui/react";
import type { ComponentProps } from "react";

function FilterSelectComponent(
	props: ComponentProps<typeof Select.Root<{ value: string; label: string; plural?: string }>> & {
		plural?: boolean
		placeholder: string
	},
) {
	const { collection, value, onValueChange, plural, placeholder, ...boxProps } = props

	return (
		<Root
			collection={collection}
			value={value}
			onValueChange={onValueChange}
			positioning={{ sameWidth: false, placement: "bottom-start" }}
			{...boxProps}
		>
			<Control>
				<Trigger>
					<ValueText placeholder={placeholder} />
				</Trigger>
			</Control>
			<ContentWrapper>
				{collection.items.map((item) => (
					<Select.Item item={item} key={item.value}>
						{plural ? (item.plural ?? item.label) : item.label}
						<Select.ItemIndicator />
					</Select.Item>
				))}
			</ContentWrapper>
		</Root>
	)
}

const Root = chakra(
	Select.Root<{ value: string; label: string; plural?: string }>,
	{
		base: {
			// boxShadow: "pane0",
			// border: "1px solid {gray/50}",
			// borderRadius: "xl",
			padding: 0,
			flex: "0 1 max-content",
			justifyContent: "center",
		},
	},
	{
		defaultProps: {
			positioning: { sameWidth: false, placement: "bottom-start" },
			lazyMount: true,
			unmountOnExit: true
		},
	},
)

const Control = chakra(Select.Control, {
	base: {
		padding: 0,
		width: "unset",
	},
})

const Trigger = chakra(Select.Trigger, {
	base: {
		width: "100%",
		padding: 2,
		minHeight: "max-content",
		border: "none",
		outline: "none",
		_disabled: { cursor: "default" },
	},
})

const ValueText = chakra(Select.ValueText, {
	base: {
		minWidth: "2rem",
		maxWidth: "unset",
		width: "100%",
		padding: 0,
		lineClamp: "unset",
		textAlign: "center",
	},
})

function ContentWrapper(props: ComponentProps<typeof Select.Content>) {
	return (
		<Portal>
			<Select.Positioner>
				<Select.Content
					data-filter-popup
					overflowY={"auto"}
					maxHeight={"50vh"}
					scrollbarWidth={"thin"}
					scrollbarGutter={"stable"}
					{...props}
				/>
			</Select.Positioner>
		</Portal>
	)
}

const FilterSelect = FilterSelectComponent as typeof FilterSelectComponent & {
	Root: typeof Root
	Control: typeof Control
	Trigger: typeof Trigger
	ValueText: typeof ValueText
	ContentWrapper: typeof ContentWrapper
}
FilterSelect.Root = Root
FilterSelect.Control = Control
FilterSelect.Trigger = Trigger
FilterSelect.ValueText = ValueText
FilterSelect.ContentWrapper = ContentWrapper

export default FilterSelect
