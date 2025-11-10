import {
	Context,
	createContext,
	memo,
	type PropsWithChildren,
	useContext,
	useEffect,
	useMemo,
} from "react"
import { proxy, useSnapshot } from "valtio"

type Selectable<T> = {
	selected: boolean
	item: T
}
type SelectableContextType<T = unknown> = {
	items: Record<string, Selectable<T>>
	selectedItems: T[]
	options: SelectableGroupOptions<T>
	onSelectionChanged?: (selectedItems: T[]) => void
	keyFn: (item: T) => string | number
}
const SelectableContext = createContext<SelectableContextType | null>(null)

function clearAllSelected<T>(state: SelectableContextType<T>) {
	Object.entries(state.items).forEach(([_k, v]) => {
		if (v.selected) v.selected = false
	})
}

function removeItem(state: SelectableContextType, key: string | number) {
	const value = state.items[key].selected
	delete state.items[key]
	if (value) updateSelectedList(state)
}

function updateSelectedList<T>(state: SelectableContextType<T>) {
	state.selectedItems = Object.values(state.items)
		.filter((it) => it.selected)
		.map((it) => it.item)
	if (state.onSelectionChanged) {
		state.onSelectionChanged(state.selectedItems)
	}
}

function setSelected<T>(state: SelectableContextType<T>, key: string | number, value: boolean) {
	if (state.items[key].selected !== value) {
		state.items[key].selected = value
	}
}

function selectItem<T>(
	state: SelectableContextType<T>,
	key: string | number,
	modifier: boolean,
	value?: boolean,
) {
	const current = state.items[key]
	if (!current) throw new Error("why don't we know this item?")
	// in single select we can clear all regardless of value
	if (state.options.mode === "single") {
		const newValue = typeof value === "boolean" ? value : !current.selected
		clearAllSelected(state)
		setSelected(state, key, newValue)
	}
	// in modifier mode, and no modifier, then clear all selections
	// if value is undefined, it should be true unless it's the only selected item
	else if (state.options.mode === "multipleModifier") {
		if (modifier) {
			// if modifier held, undefined value is a toggle
			const newValue = typeof value === "boolean" ? value : !current.selected
			setSelected(state, key, newValue)
		} else {
			// if modifier not held, undefined selects - unless it's the only selected value
			const newValue =
				typeof value === "boolean"
					? value
					: !(state.selectedItems.length === 1 && state.selectedItems[0] === current.item)
			clearAllSelected(state)
			setSelected(state, key, newValue)
		}
	}
	// multipleToggle is straightforward
	else if (state.options.mode === "multipleToggle") {
		const newValue = typeof value === "boolean" ? value : !current.selected
		setSelected(state, key, newValue)
	}

	updateSelectedList(state)
}
type SelectableGroupProps<T> = PropsWithChildren<{
	onSelectionChanged?: (selectedItems: T[]) => void
}>
type SelectableGroupOptions<T> = {
	mode?: "single" | "multipleToggle" | "multipleModifier"
	keyFn?: (item: T) => string | number
}
const defaultSelectableGroupOptions = {
	multiple: "single",
	keyFn: (item: unknown) => JSON.stringify(item),
} as const
export function useSelectableGroup<T>(opts: SelectableGroupOptions<T> = {}) {
	const options = { ...defaultSelectableGroupOptions, ...opts }
	const cv = proxy({
		items: {} as Record<string, Selectable<T>>,
		selectedItems: [] as T[],
		options,
		onSelectionChanged: undefined,
		keyFn: options.keyFn,
	}) as SelectableContextType<T>

	const Context = SelectableContext as Context<SelectableContextType<T>>

	const SelectableGroup = memo((props: SelectableGroupProps<T>) => {
		const { children, onSelectionChanged } = props
		if (cv.onSelectionChanged !== onSelectionChanged) {
			cv.onSelectionChanged = onSelectionChanged
		}
		return <Context value={cv}>{children}</Context>
	})

	const snap = useSnapshot(cv)

	return { SelectableGroup, selectedItems: snap.selectedItems }
}

export function useSelectable<T>(item: T, initialValue = false) {
	const context = useContext(SelectableContext)
	if (!context) throw new Error("useSelectable must be used within a SelectableGroup")
	const snap = useSnapshot(context)
	const key = context.keyFn(item)

	useEffect(() => {
		if (!(key in context.items)) {
			context.items[key] = { item, selected: initialValue }
		}
		return () => {
			removeItem(context, key)
		}
	}, [context, initialValue, key, item])

	const handlers = useMemo(
		() => ({
			onClick(e: React.MouseEvent) {
				const modifier = e.metaKey || e.ctrlKey || e.altKey
				selectItem(context, key, modifier)
			},
		}),
		[context, key],
	)

	return {
		isSelected: snap.items[key]?.selected,
		handlers,
	}
}
