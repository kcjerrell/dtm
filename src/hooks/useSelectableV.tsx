import {
	type Context,
	createContext,
	memo,
	type PropsWithChildren,
	useContext,
	useMemo,
	useRef,
} from "react"
import { proxy, ref, useSnapshot, type Snapshot } from "valtio"

type SelectableContextType<T extends Selectable = Selectable> = {
	getItems: () => T[]
	mode: "single" | "multipleToggle" | "multipleModifier"
	onSelectionChanged?: (selectedItems: T[]) => void
	keyFn: (item: T | Snapshot<T>) => string | number
}
const SelectableContext = createContext<SelectableContextType | null>(null)

function clearAllSelected<T extends Selectable>(state: SelectableContextType<T>) {
	state.getItems().forEach((it) => {
		if (it.selected) it.setSelected(false)
	})
}

function selectItem<T extends Selectable>(
	state: SelectableContextType<T>,
	// key: string | number,
	item: T,
	modifier: boolean,
	value?: boolean,
) {
	console.log(state)
	console.log("selectItem", item, value)
	const items = state.getItems()
	const itemState = items?.find(it => state.keyFn(it) === state.keyFn(item))
	if (!itemState) return

	// in single select we can clear all regardless of value
	if (state.mode === "single") {
		const newValue = value ?? !itemState.selected
		clearAllSelected(state)
		if (newValue) itemState.setSelected(newValue)
	}
	// in modifier mode, and no modifier, then clear all selections
	// if value is undefined, it should be true unless it's the only selected item
	else if (state.mode === "multipleModifier") {
		if (modifier) {
			// if modifier held, undefined value is a toggle
			const newValue = value ?? !itemState.selected
			itemState.setSelected(newValue)
		} else {
			// if modifier not held, undefined selects - unless it's the only selected value
			const areOthersSelected = items.some(
				(it) => state.keyFn(it) !== state.keyFn(itemState) && it.selected,
			)
			const newValue = value ?? (!itemState.selected || areOthersSelected)
			console.log(areOthersSelected, newValue)
			clearAllSelected(state)
			if (newValue) itemState.setSelected(newValue)
			console.log("set selected", item.selected)
		}
	}
	// multipleToggle is straightforward
	else if (state.mode === "multipleToggle") {
		const newValue = value ?? !itemState.selected
		itemState.setSelected(newValue)
	}

	if (state.onSelectionChanged) {
		const selectedItems = items.filter((it) => it.selected)
		state.onSelectionChanged(selectedItems)
	}
}

type SelectableGroupOptions<T extends Selectable> = {
	onSelectionChanged?: (selectedItems: T[]) => void
	mode?: "single" | "multipleToggle" | "multipleModifier"
	/** This should be a stable reference for cv to memoize */
	keyFn?: (item: T | Snapshot<T>) => string | number
}

const defaultSelectableGroupOptions = {
	mode: "single",
	keyFn: (item: unknown) => JSON.stringify(item),
} as const

export function useSelectableGroup<T extends Selectable>(
	itemsSnap: Snapshot<T[]>,
	getItemsState: () => T[],
	opts: SelectableGroupOptions<T> = {},
) {
	const { mode, keyFn, onSelectionChanged } = { ...defaultSelectableGroupOptions, ...opts }

	const onSelectionChangedRef = useRef((_: T[]) => {})
	if (onSelectionChanged && onSelectionChanged !== onSelectionChangedRef.current) {
		onSelectionChangedRef.current = onSelectionChanged
	}

	const cv = {
		getItems: getItemsState,
		mode,
		keyFn,
		onSelectionChanged,
	}

	const Context = SelectableContext as Context<SelectableContextType<T> | null>
	const SelectableGroup = memo((props: PropsWithChildren) => {
		return <Context value={cv}>{props.children}</Context>
	})

	const selectedItems = itemsSnap.filter((item) => item.selected)

	const clearSelection = () => clearAllSelected(cv)

	return { SelectableGroup, selectedItems, clearSelection }
}

export function useSelectable<T extends Selectable>(item: T) {
	const context = useContext(SelectableContext)
	if (!context) throw new Error("useSelectable must be used within a SelectableGroup")

	const key = context.keyFn(item)

	console.log("useSelectable", key)

	const handlers = useMemo(
		() => ({
			onClick(e: React.MouseEvent) {
				console.log(key, "got clicked")
				const modifier = e.metaKey || e.ctrlKey || e.altKey
				selectItem(context, item, modifier)
			},
		}),
		[context, key, item],
	)

	return {
		isSelected: item.selected ?? false,
		handlers,
	}
}

export type Selectable<T extends object = Record<string, unknown>> = T & {
	selected: boolean
	setSelected: (value: boolean) => void
	toggleSelected: () => void
}
export function makeSelectable<T extends object>(item: T, initialValue = false): Selectable<T> {
	const p = proxy({
		...item,
		_selected: initialValue,
		get selected() {
			return p._selected
		},
		setSelected(value: boolean) {
			p._selected = value
		},
		toggleSelected() {
			p._selected = !p._selected
		},
	})

	return p
}
