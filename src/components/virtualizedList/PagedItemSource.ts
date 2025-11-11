import { useInitRef } from "@/hooks/useInitRef"
import { Mutex } from "async-mutex"
import { useCallback, useRef } from "react"
import { proxy, useSnapshot } from "valtio"

type Page<T> = {
	/** inclusive */
	from: number
	/** inclusive */
	to: number
	items: T[]
}

type PagedItemSourceState<T> = {
	pages: Page<T>[]
	renderItems: (T | null)[]
	firstIndex: number
	lastIndex: number
}

type UsePagedItemSourceOpts<T> = {
	getItems: (skip: number, take: number) => Promise<T[] | undefined>
	pageSize: number
	totalCount: number
}

export function usePagedItemSource<T>(opts: UsePagedItemSourceOpts<T>) {
	const { getItems, pageSize, totalCount } = opts

	const state: PagedItemSourceState<T> = useInitRef(() =>
		proxy({
			pages: [] as Page<T>[],
			renderItems: [] as T[],
			firstIndex: 0,
			lastIndex: 0,
			pageSize,
		}),
	)

	const pageLoader = useRef(new Mutex())
	const loadersWaiting = useRef(0)

	/** returns true if a new page was loaded */
	const loadPage = useCallback(
		async (index: number) => {
			if (state.pages[index]) return false
			const page = await getItems(index * pageSize, pageSize)
			if (!page) return false
			state.pages[index] = { from: index * pageSize, to: (index + 1) * pageSize - 1, items: page }
			return true
		},
		[getItems, pageSize, state],
	)

	const ensurePages = useCallback(async () => {
		loadersWaiting.current++
		await pageLoader.current.runExclusive(async () => {
			loadersWaiting.current--
			const { firstIndex, lastIndex } = state

			const firstPage = Math.floor(firstIndex / pageSize)
			const lastPage = Math.floor(lastIndex / pageSize)

			let pagesLoaded = 0

			for (let i = firstPage; i <= lastPage; i++) {
				if (await loadPage(i)) pagesLoaded++
			}

			if (pagesLoaded) setRenderItems(state)

			// if a loader is waiting, we'll go ahead and yield
			if (loadersWaiting.current) return

			// if not, let's check for the neighboring pages
			const nextPage = Math.min(lastPage + 1, Math.ceil(totalCount / pageSize) - 1)
			await loadPage(nextPage)

			if (loadersWaiting.current) return

			const prevPage = Math.max(firstPage - 1, 0)
			await loadPage(prevPage)
		})
	}, [pageSize, state, loadPage, totalCount])

	const setRenderWindow = useCallback(
		(first: number, last: number) => {
			state.firstIndex = first
			state.lastIndex = last

			setRenderItems(state)
			ensurePages()
		},
		[state, ensurePages],
	)

	const { renderItems } = useSnapshot(state)

	return {
    renderItems,
    setRenderWindow,
  }
}

function setRenderItems<T>(state: PagedItemSourceState<T>) {
	const { firstIndex, lastIndex, pages } = state

	function* getItems(): Generator<T | null> {
		let index = firstIndex
		let page: Page<T> | undefined
		while (index <= lastIndex) {
			// assign the current page
			if (!page || page.to < index) {
				page = pages.find((p) => p && p.from <= index && p.to >= index)
			}

			// yield the item
			yield page?.items[index - page?.from] ?? null

			index++
		}
	}

	state.renderItems = [...getItems()]
}
