import { HStack, VStack } from "@chakra-ui/react"
import { Children, useEffect, useRef, type ComponentType } from "react"
import type { IconType } from "react-icons/lib"
import { PiInfo } from "react-icons/pi"
import type { Snapshot } from "valtio"
import { type Selectable, useSelectableGroup } from "@/hooks/useSelectableV"
import { IconButton, PaneListContainer, PanelListItem, PanelSectionHeader, Tooltip } from "."

interface PanelListComponentProps<T> extends ChakraProps {
	emptyListText?: string | boolean
	commands?: PanelListCommand<T>[]
	header?: string
	headerInfo?: string
	keyFn?: (item: T | Snapshot<T>) => string | number
	getItems: () => T[]
	itemsSnap: Snapshot<T[]>
	onSelectionChanged?: (selected: T[]) => void
	clearSelection?: unknown
}

export interface PanelListCommand<T> {
	id: string
	icon?: IconType | ComponentType
	getIcon?: (selected: Snapshot<T[]>) => IconType | ComponentType
	requiresSelection?: boolean
	requiresSingleSelection?: boolean
	tip?: string
	getTip?: (selected: Snapshot<T[]>) => string
	onClick: (selected: Snapshot<T[]>) => void
}

function PanelList<T extends Selectable>(props: PanelListComponentProps<T>) {
	const {
		children,
		emptyListText: emptyListTextProp,
		commands,
		header,
		headerInfo,
		keyFn,
		getItems,
		itemsSnap,
		onSelectionChanged,
		clearSelection,
		...boxProps
	} = props

	const { SelectableGroup, selectedItems } = useSelectableGroup<T>(itemsSnap, getItems, {
		mode: "multipleModifier",
		keyFn,
		onSelectionChanged,
	})

	const clearSelectionRef = useRef(clearSelection)

	useEffect(() => {
		if (clearSelection) {
			const items = getItems()
			items.forEach((it) => {
				if (it.selected) {
					it.setSelected(false)
				}
			})
		}
		clearSelectionRef.current = clearSelection
	}, [clearSelection, getItems])

	const areItemsSelected = selectedItems.length > 0
	const emptyListText =
		emptyListTextProp === false
			? null
			: typeof emptyListTextProp === "string"
				? emptyListTextProp
				: "(No items)"

	return (
		<VStack {...boxProps} alignItems={"stretch"} gap={0}>
			{header && (
				<PanelSectionHeader margin={0}>
					{header}
					{headerInfo && (
						<Tooltip tip={headerInfo}>
							<PiInfo />
						</Tooltip>
					)}
				</PanelSectionHeader>
			)}
			<PaneListContainer>
				<SelectableGroup>{children}</SelectableGroup>

				{!emptyListText && areItemsSelected && (
					<PanelListItem bgColor={"transparent"} fontStyle={"italic"} textAlign={"center"}>
						{emptyListText}
					</PanelListItem>
				)}

				<HStack justifyContent={"flex-end"} bottom={0}>
					{commands?.map((command) => {
						const Icon = command.getIcon ? command.getIcon(selectedItems) : command.icon
						const tip = command.getTip ? command.getTip(selectedItems) : command.tip
						const disabled =
							(command.requiresSingleSelection && selectedItems.length !== 1) ||
							(command.requiresSelection && !areItemsSelected)

						const CommandButton = (
							<IconButton
								key={command.id}
								size={"sm"}
								onClick={() => command.onClick(selectedItems)}
								disabled={disabled}
							>
								{Icon && <Icon />}
							</IconButton>
						)

						if (tip)
							return (
								<Tooltip key={command.id} tip={tip}>
									{CommandButton}
								</Tooltip>
							)
						return CommandButton
					})}
				</HStack>
			</PaneListContainer>
		</VStack>
	)
}

export default PanelList
