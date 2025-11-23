import {
	type Context,
	createContext,
	memo,
	type PropsWithChildren,
	useContext,
	useMemo,
	useRef,
} from "react"
import { proxy, type Snapshot } from "valtio"

type SelectableContextType<T extends Selectable = Selectable> = {
	getItems: () => T[]
	mode: "single" | "multipleToggle" | "multipleModifier"
	onSelectionChanged?: (selectedItems: T[]) => void
	keyFn: (item: T | Snapshot<T>) => string | number
	lastSelectedItem: React.RefObject<T | null>
	itemsSnap: Snapshot<T[]>
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
	modifier?: "shift" | "cmd" | null,
	value?: boolean,
) {
	const items = state.getItems()
	const itemState = items?.find((it) => state.keyFn(it) === state.keyFn(item))
	if (!itemState) return

	// single select mode
	if (state.mode === "single") {
		const newValue = value ?? !itemState.selected
		clearAllSelected(state)
		if (newValue) itemState.setSelected(newValue)
	}
	// multiple toggle mode
	else if (state.mode === "multipleToggle") {
		const newValue = value ?? !itemState.selected
		itemState.setSelected(newValue)
	}
	// multiple modifier mode
	else if (state.mode === "multipleModifier") {
		// cmd updates target item only, leaving other selections unchanged
		if (modifier === "cmd") {
			const newValue = value ?? !itemState.selected
			itemState.setSelected(newValue)
			if (newValue) state.lastSelectedItem.current = itemState
		} else if (modifier === "shift" && state.lastSelectedItem.current) {
			// this doesn't align with how shift works in Finder
			// shift SELECTS all items between the last selected and target item
			// and updates the last selected item to the target item
			// we need to be careful about state vs snap here
			const itemsSnap = state.itemsSnap
			const lastItem = state.lastSelectedItem.current
			const start = itemsSnap.findIndex(it => state.keyFn(it) === state.keyFn(lastItem))
			const end = itemsSnap.findIndex(it => state.keyFn(it) === state.keyFn(item))
			if (start === -1 || end === -1) return
			for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
				const itemSnap = itemsSnap[i]
				const it = items.find(i => state.keyFn(i) === state.keyFn(itemSnap))
				if (it) it.setSelected(true)
			}
			state.lastSelectedItem.current = itemState
		} else {
			// if modifier not held, undefined selects - unless it's the only selected value
			const areOthersSelected = items.some(
				(it) => state.keyFn(it) !== state.keyFn(itemState) && it.selected,
			)
			const newValue = value ?? (!itemState.selected || areOthersSelected)
			clearAllSelected(state)
			if (newValue) {
				itemState.setSelected(newValue)
				state.lastSelectedItem.current = itemState
			}
			else {
				state.lastSelectedItem.current = null
			}
		}
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

	const lastSelectedItem = useRef<T | null>(null)

	const cv = {
		getItems: getItemsState,
		itemsSnap,
		mode,
		keyFn,
		onSelectionChanged,
		lastSelectedItem,
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

	const handlers = useMemo(
		() => ({
			onClick(e: React.MouseEvent) {
				const modifier = getModifier(e)
				selectItem(context, item, modifier)
			},
		}),
		[context, item],
	)

	return {
		isSelected: item.selected ?? false,
		handlers,
	}
}

export type Selectable<T extends object = object> = T & {
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

function getModifier(e: React.MouseEvent) {
	if (e.shiftKey) return "shift"
	if (e.metaKey) return "cmd"
	return null
}
