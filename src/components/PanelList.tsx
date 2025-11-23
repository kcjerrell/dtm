import { HStack, VStack } from "@chakra-ui/react"
import { motion, useSpring } from "motion/react"
import { type ComponentType, useEffect, useRef } from "react"
import type { IconType } from "react-icons/lib"
import { PiInfo } from "react-icons/pi"
import type { Snapshot } from "valtio"
import { type Selectable, useSelectableGroup } from "@/hooks/useSelectableV"
import { IconButton, PaneListContainer, PanelListItem, PanelSectionHeader, Tooltip } from "."
import { PaneListScrollContainer, PanelListScrollContent } from "./common"

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
	getEnabled?: (selected: Snapshot<T[]>) => boolean
	/** if present, tipTitle and tipText will be ignored */
	tip?: React.ReactNode
	tipTitle?: string
	tipText?: string
	getTip?: (selected: Snapshot<T[]>) => React.ReactNode
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
	const wrapperRef = useRef<HTMLDivElement>(null)
	const contentRef = useRef<HTMLDivElement>(null)

	const scrollY = useRef(0)
	const scrollYMv = useSpring(0, { mass: 1, stiffness: 210, damping: 25, visualDuration: 0.5 })

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
		<VStack overflowY={"clip"} overflowX={"clip"} {...boxProps} alignItems={"stretch"} gap={0}>
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
					overflowY="clip"
					onWheel={(e) => {
						if (!wrapperRef.current || !contentRef.current) return
						const max = contentRef.current?.clientHeight - wrapperRef.current?.clientHeight
						scrollY.current = Math.max(0, Math.min(max, scrollY.current + e.deltaY))
						scrollYMv.set(-scrollY.current)
					}}
				>
					<PanelListScrollContent ref={contentRef} asChild>
						<motion.div style={{ y: scrollYMv }}>
							<SelectableGroup>{children}</SelectableGroup>
						</motion.div>
					</PanelListScrollContent>
				</PaneListScrollContainer>

				{!emptyListText && areItemsSelected && (
					<PanelListItem bgColor={"transparent"} fontStyle={"italic"} textAlign={"center"}>
						{emptyListText}
					</PanelListItem>
				)}

			<HStack justifyContent={"flex-end"} bottom={0}>
				{commands?.map((command) => {
					let enabled = true
					if (command.requiresSelection && !areItemsSelected) enabled = false
					if (command.requiresSingleSelection && selectedItems.length !== 1) enabled = false
					if (command.getEnabled) enabled = command.getEnabled(selectedItems)

					const Icon = command.getIcon ? command.getIcon(selectedItems) : command.icon
					const tip = command.getTip ? command.getTip(selectedItems) : command.tip

					const CommandButton = (
						<IconButton
							key={command.id}
							size={"sm"}
							onClick={() => command.onClick(selectedItems)}
							disabled={!enabled}
						>
							{Icon && <Icon />}
						</IconButton>
					)

					if (tip || command.tipTitle || command.tipText)
						return (
							<Tooltip
								key={command.id}
								tip={tip}
								tipTitle={command.tipTitle}
								tipText={command.tipText}
							>
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
