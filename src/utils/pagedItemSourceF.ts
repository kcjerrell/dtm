import { Mutex } from "async-mutex"
import { proxy } from "valtio"
import va from "./array"

export type PagedItem<T> = T | null | undefined

type Page<T> = {
	/** inclusive */
	from: number
	/** inclusive */
	to: number
	/** null indicates the item hasn't loaded yet
	 * undefined indicates the item doesn't exist, or the request failed */
	items: PagedItem<T>[]
}

type PagedItemSourceState<T> = {
	pages: Page<T>[]
	renderItems: PagedItem<T>[]
	firstIndex: number
	lastIndex: number
}

type PagedItemsGetter<T> = (skip: number, take: number) => Promise<PagedItem<T>[] | undefined>

export type PagedItemSource<T> = {
	state: PagedItemSourceState<T>
	setRenderWindow: (first: number, last: number) => void
	totalCount: number
}

export function pagedItemSource<T>(
	getItems: PagedItemsGetter<T>,
	totalCount: number,
	pageSize = 250,
): PagedItemSource<T> {
	const state = proxy<PagedItemSourceState<T>>({
		pages: [],
		renderItems: [],
		firstIndex: 0,
		lastIndex: 0,
	})

	const pageLoader = new Mutex()
	let loadersWaiting = 0

	const loadPage = async (index: number) => {
		if (state.pages[index]) return false
		const page = await getItems(index * pageSize, pageSize)
		if (!page || page.length === 0) return false
		state.pages[index] = {
			from: index * pageSize,
			to: (index + 1) * pageSize - 1,
			items: [...page],
		}
		return true
	}

	const getRenderItems = (firstIndex: number, lastIndex: number) => {
		const pages = state.pages

		function* getItems(): Generator<T | null | undefined> {
			let index = firstIndex
			let page: Page<T> | undefined
			while (index <= lastIndex) {
				// assign the current page
				if (!page || page.to < index) {
					page = pages.find((p) => p && p.from <= index && p.to >= index)
				}

				const item = page?.items[index - page?.from] ?? null
				yield item

				index++
			}
		}

		return [...getItems()]
	}

	const updateRenderItems = () => {
		va.set(
			state.renderItems,
			getRenderItems(state.firstIndex, Math.min(state.lastIndex, totalCount - 1)),
		)
	}

	const ensurePages = () => {
		if (!totalCount) return
		loadersWaiting++

		pageLoader.runExclusive(async () => {
			loadersWaiting--
			const { firstIndex, lastIndex } = state

			const firstPage = Math.floor(firstIndex / pageSize)
			const lastPage = Math.floor(lastIndex / pageSize)

			let pagesLoaded = 0

			for (let i = firstPage; i <= lastPage; i++) {
				if (await loadPage(i)) pagesLoaded++
			}

			if (pagesLoaded) updateRenderItems()

			if (loadersWaiting) return

			const nextPage = Math.min(lastPage + 1, Math.ceil(totalCount / pageSize) - 1)
			await loadPage(nextPage)

			if (loadersWaiting) return

			const prevPage = Math.max(firstPage - 1, 0)
			await loadPage(prevPage)
		})
	}

	const setRenderWindow = (first: number, last: number) => {
		state.firstIndex = first
		state.lastIndex = last
		updateRenderItems()
		ensurePages()
	}

	return {
		state,
		setRenderWindow,
    totalCount
	}
}
