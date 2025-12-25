import type { SamplerType } from "dt-grpc-ts/web"
import { useMemo } from "react"
import { proxy, useSnapshot } from "valtio"
import type { Model } from "@/commands"
import { DTPStateController } from "@/dtProjects/state/StateController"
import { arrayIfOnly } from "@/utils/helpers"
import {
	type FilterValueSelector,
	filterTargets,
	targetCollection,
} from "../controlPane/filters/collections"

export type SearchControllerState = {
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

/**
 * Handles state for building search queries.
 * Must assign onSearch callback
 * useDTP() will handle this
 */
class SearchController extends DTPStateController<SearchControllerState> {
	state = proxy<SearchControllerState>({
		searchInput: "",
		filters: [],
	})

	constructor() {
		super("search")
	}

	onSearch: (searchText?: string, searchFilters?: BackendFilter[]) => void = () => {
		console.warn("must assign onSearch callback")
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
			if (
				!filter.target ||
				!filter.operator ||
				filter.value === undefined ||
				filter.value === null
			)
				continue
			const filterTarget = filterTargets[filter.target as keyof typeof filterTargets]

			const bFilter: BackendFilter = {
				target: filter.target,
				operator: filter.operator,
				value: arrayIfOnly(
					filterTarget.prepare ? filterTarget.prepare(filter.value) : filter.value,
				) as string[] | number[],
			}
			filters.push(bFilter)
		}

		this.onSearch(searchText, filters)
	}

	useSearchFilter<T>(index: number) {
		const filterState = this.state.filters[index] as Filter<T>
		if (!filterState) throw new Error("Invalid filter index")

		const snap = useSnapshot(filterState)
		const { target, operator, value, isEditing } = snap

		const operatorCollection = filterTargets[target ?? "none"]?.collection
		const ValueSelector = filterTargets[target ?? "none"]
			?.ValueComponent as FilterValueSelector<T>

		const callbacks = useMemo(
			() => ({
				setTarget: (target?: string) => {
					const prev = filterState.target
					if (target === prev) return

					filterState.target = target
					if (!target) {
						filterState.operator = undefined
						filterState.value = undefined
						return
					}
					filterState.value = filterTargets[target].initialValue as T

					if (
						filterTargets[target].collection !==
						filterTargets[prev ?? "none"].collection
					) {
						filterState.operator = filterTargets[target].collection
							.firstValue as FilterOperator
					}
				},
				setOperator: (operator?: FilterOperator) => {
					filterState.operator = operator
				},
				setValue: (value?: T) => {
					filterState.value = value
				},
				setIsEditing: (isEditing: boolean) => {
					filterState.isEditing = isEditing
				},
			}),
			[filterState],
		)

		return {
			snap,
			state: filterState,
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
}

export default SearchController
