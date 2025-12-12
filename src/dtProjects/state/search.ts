import type { SamplerType } from "dt-grpc-ts/web"
import { useMemo } from "react"
import { proxy, useSnapshot } from "valtio"
import type { Model } from "@/commands"
import { arrayIfOnly } from "@/utils/helpers"
import {
	type FilterValueSelector,
	filterTargets,
	targetCollection,
} from "../controlPane/filters/collections"
import DTProjects, { type DTProjectsStateType, type IDTProjectsStore } from "./projectStore"

export type SearchState = {
	searchInput: string
	filters: Filter[]
}

export type FilterOperator =
	| "eq"
	| "neq"
	| "gt"
	| "gte"
	| "lt"
	| "lte"
	| "is"
	| "isnot"
	| "has"
	| "doesnothave"

export type Filter<T = FilterValue> = {
	index: number
	target?: string
	operator?: FilterOperator
	value?: T
	isEditing?: boolean
}

export type BackendFilter<T = string[] | number[]> = {
	target: string
	operator: FilterOperator
	value: T
}

export type ContentType = "depth" | "pose" | "color" | "custom" | "scribble" | "shuffle"
export type FilterValue = number | ContentType[] | Model | SamplerType

export class SearchService {
	#dtp: IDTProjectsStore
	rootState: DTProjectsStateType
	state: SearchState = proxy({
		searchInput: "",
		filters: [],
	})

	constructor(dtp: IDTProjectsStore) {
		this.#dtp = dtp
		this.rootState = dtp.state
	}

	addEmptyFilter(isEditing?: boolean) {
		const filter = { index: this.state.filters.length, isEditing } as Filter
		this.state.filters.push(filter)
	}

	removeFilter(index: number) {
		this.state.filters.splice(index, 1)
		this.state.filters.forEach((filter, i) => {
			filter.index = i
		})
	}

	clearFilters() {
		this.state.filters.splice(0, this.state.filters.length)
	}

	/** updates the current image source with the latest values from the search panel */
	applySearch() {
		// empty string should be undefined
		const searchText = this.state.searchInput || undefined
		
		const filters: BackendFilter[] = []
		for (const filter of this.state.filters) {
			if (!filter.target || !filter.operator || filter.value === undefined || filter.value === null)
				continue
			const filterTarget = filterTargets[filter.target]

			const bFilter: BackendFilter = {
				target: filter.target,
				operator: filter.operator,
				value: arrayIfOnly(
					filterTarget.prepare ? filterTarget.prepare(filter.value) : filter.value,
				) as string[] | number[],
			}
			filters.push(bFilter)
		}

		this.#dtp.setSearchFilter(searchText, filters)
	}
}

export function useSearchService() {
	const state = DTProjects.store.state.search
	const snap = useSnapshot(state)
	return {
		snap,
		state,
	}
}

export function useSearchServiceFilter<T>(index: number) {
	const state = DTProjects.store.state.search.filters[index] as Filter<T>
	if (!state) throw new Error("Invalid filter index")

	const snap = useSnapshot(state)
	const { target, operator, value, isEditing } = snap

	const operatorCollection = filterTargets[target ?? "none"]?.collection
	const ValueSelector = filterTargets[target ?? "none"]?.ValueComponent as FilterValueSelector<T>

	const callbacks = useMemo(
		() => ({
			setTarget: (target?: string) => {
				const prev = state.target
				if (target === prev) return

				state.target = target
				if (!target) {
					state.operator = undefined
					state.value = undefined
					return
				}
				state.value = filterTargets[target].initialValue as T

				if (filterTargets[target].collection !== filterTargets[prev ?? "none"].collection) {
					state.operator = filterTargets[target].collection.firstValue as FilterOperator
				}
			},
			setOperator: (operator?: FilterOperator) => {
				state.operator = operator
			},
			setValue: (value?: T) => {
				state.value = value
			},
			setIsEditing: (isEditing: boolean) => {
				state.isEditing = isEditing
			},
		}),
		[state],
	)

	return {
		snap,
		state,
		isEditing: isEditing ?? false,
		target,
		operator,
		value: value as T,
		targetCollection,
		operatorCollection,
		ValueSelector,
		...callbacks,
	}
}
