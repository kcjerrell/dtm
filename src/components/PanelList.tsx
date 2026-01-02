import { HStack, Spacer, VStack } from "@chakra-ui/react"
import { motion, useSpring } from "motion/react"
import { type ComponentType, useEffect, useMemo, useRef } from "react"
import type { IconType } from "@/components/icons"
import { PiInfo } from "@/components/icons"
import { proxy, type Snapshot, useSnapshot } from "valtio"
import { type Selectable, useSelectableGroup } from "@/hooks/useSelectableV"
import { IconButton, PaneListContainer, PanelListItem, PanelSectionHeader, Tooltip } from "."
import { PaneListScrollContainer, PanelListScrollContent } from "./common"

interface PanelListComponentProps<T, C = undefined> extends ChakraProps {
	emptyListText?: string | boolean
	commands?: PanelListCommandItem<T, C>[]
	commandContext?: C
	header?: string
	headerInfo?: string
	keyFn?: (item: T | Snapshot<T>) => string | number
	/** must be a valtio proxy (or a function that returns one) */
	itemsState: ValueOrGetter<T[]>
	onSelectionChanged?: (selected: T[]) => void
	clearSelection?: unknown
	selectionMode?: "multipleModifier" | "multipleToggle" | "single"
}

export type PanelListCommandItem<T, C = undefined> = PanelListCommand<T, C> | "spacer"

export interface PanelListCommand<T, C = undefined> {
	id: string
	icon?: IconType | ComponentType
	getIcon?: (selected: Snapshot<T[]>, context?: C) => IconType | ComponentType
	requiresSelection?: boolean
	requiresSingleSelection?: boolean
	getEnabled?: (selected: Snapshot<T[]>, context?: C) => boolean
	/** if present, tipTitle and tipText will be ignored */
	tip?: React.ReactNode
	tipTitle?: string
	tipText?: string
	getTip?: (selected: Snapshot<T[]>, context?: C) => React.ReactNode
	getTipTitle?: (selected: Snapshot<T[]>, context?: C) => string
	getTipText?: (selected: Snapshot<T[]>, context?: C) => string
	onClick: (selected: Snapshot<T[]>, context?: C) => void
}

function PanelList<T extends Selectable, C = undefined>(props: PanelListComponentProps<T, C>) {
	const {
		children,
		emptyListText: emptyListTextProp,
		commands,
		commandContext,
		header,
		headerInfo,
		keyFn,
		itemsState: itemsProp,
		onSelectionChanged,
		clearSelection,
		selectionMode = "multipleModifier",
		...boxProps
	} = props

	const itemsGetter = useMemo(() => {
		if (typeof itemsProp === "function") return itemsProp
		else return () => itemsProp ?? proxy([])
	}, [itemsProp])
	const items = itemsGetter()
	const itemsSnap = useSnapshot(items)

	const { SelectableGroup, selectedItems } = useSelectableGroup<T>(itemsSnap, itemsGetter, {
		mode: selectionMode,
		keyFn,
		onSelectionChanged,
	})

	const clearSelectionRef = useRef(clearSelection)
	const wrapperRef = useRef<HTMLDivElement>(null)
	const contentRef = useRef<HTMLDivElement>(null)

	// const scrollY = useRef(0)
	// const scrollYMv = useSpring(0, { mass: 1, stiffness: 210, damping: 25, visualDuration: 0.5 })

	useEffect(() => {
		if (clearSelection) {
			items.forEach((it) => {
				if (it.selected) {
					it.setSelected(false)
				}
			})
		}
		clearSelectionRef.current = clearSelection
	}, [clearSelection, items])

	const areItemsSelected = selectedItems.length > 0
	const emptyListText =
		emptyListTextProp === false
			? null
			: typeof emptyListTextProp === "string"
				? emptyListTextProp
				: "(No items)"

	return (
		<VStack
			overflowY={"clip"}
			overflowX={"clip"}
			{...boxProps}
			alignItems={"stretch"}
			justifyContent={"stretch"}
			gap={0}
		>
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
				<PaneListScrollContainer
					ref={wrapperRef}
					// overflowY="clip"
					// onWheel={(e) => {
					// 	if (!wrapperRef.current || !contentRef.current) return
					// 	const max =
					// 		contentRef.current?.clientHeight - wrapperRef.current?.clientHeight
					// 	scrollY.current = Math.max(0, Math.min(max, scrollY.current + e.deltaY))
					// 	scrollYMv.set(-scrollY.current)
					// }}
				>
					<PanelListScrollContent ref={contentRef} asChild>
						<SelectableGroup>{children}</SelectableGroup>
					</PanelListScrollContent>
				</PaneListScrollContainer>

				{!emptyListText && areItemsSelected && (
					<PanelListItem
						bgColor={"transparent"}
						fontStyle={"italic"}
						textAlign={"center"}
					>
						{emptyListText}
					</PanelListItem>
				)}

				<HStack justifyContent={"flex-end"} marginTop={"auto"} bottom={0}>
					{commands?.map((command, i) => {
						if (command === "spacer") return <Spacer key={`spacer-${i.toString()}`} />

						let enabled = true
						if (command.requiresSelection && !areItemsSelected) enabled = false
						if (command.requiresSingleSelection && selectedItems.length !== 1)
							enabled = false
						if (command.getEnabled)
							enabled = command.getEnabled(selectedItems, commandContext)

						const Icon = command.getIcon
							? command.getIcon(selectedItems, commandContext)
							: command.icon
						const tip = command.getTip
							? command.getTip(selectedItems, commandContext)
							: command.tip
						const tipTitle = command.getTipTitle
							? command.getTipTitle(selectedItems, commandContext)
							: command.tipTitle
						const tipText = command.getTipText
							? command.getTipText(selectedItems, commandContext)
							: command.tipText

						return (
							<IconButton
								key={command.id}
								size={"sm"}
								onClick={() => command.onClick(selectedItems, commandContext)}
								disabled={!enabled}
								tip={tip}
								tipTitle={tipTitle}
								tipText={tipText}
							>
								{Icon && <Icon />}
							</IconButton>
						)
					})}
				</HStack>
			</PaneListContainer>
		</VStack>
	)
}

export default PanelList
