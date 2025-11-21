import { useInitRef } from "@/hooks/useInitRef"
import { Mutex } from "async-mutex"
import { useCallback, useRef } from "react"
import { proxy, useSnapshot } from "valtio"

type PagedItem<T> = T | null | undefined

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

type UsePagedItemSourceOpts<T> = {
	getItems: (skip: number, take: number) => Promise<T[] | undefined>
	/** use a fixed page size */
	pageSize: number
	/** any items beyond this number will be ignored */
	totalCount: number
}

export function usePagedItemSource<T>(opts: UsePagedItemSourceOpts<T>) {
	const { getItems, pageSize, totalCount } = opts

	const state: PagedItemSourceState<T> = useInitRef(() =>
		proxy({
			pages: [] as Page<T>[],
			renderItems: [] as PagedItem<T>[],
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
			if (!page || page.length === 0) return false
			state.pages[index] = {
				from: index * pageSize,
				to: (index + 1) * pageSize - 1,
				items: [...page],
			}
			return true
		},
		[getItems, pageSize, state],
	)

	const updateRenderItems = useCallback(() => {
		state.renderItems = getRenderItems(
			state.firstIndex,
			Math.min(state.lastIndex, totalCount - 1),
			state.pages,
		)
	}, [state, totalCount])

	const ensurePages = useCallback(async () => {
		loadersWaiting.current++
		// mutex is used to prevent spamming multiple requests for the same page
		// if this turns out to be slow, we mark individual pages as loading
		// allowing for simultaneous requests for different pages
		await pageLoader.current.runExclusive(async () => {
			loadersWaiting.current--
			const { firstIndex, lastIndex } = state

			const firstPage = Math.floor(firstIndex / pageSize)
			const lastPage = Math.floor(lastIndex / pageSize)

			let pagesLoaded = 0

			for (let i = firstPage; i <= lastPage; i++) {
				if (await loadPage(i)) pagesLoaded++
			}

			if (pagesLoaded) updateRenderItems()

			// if a loader is waiting, we'll go ahead and yield
			if (loadersWaiting.current) return

			// if not, let's check for the neighboring pages
			const nextPage = Math.min(lastPage + 1, Math.ceil(totalCount / pageSize) - 1)
			await loadPage(nextPage)

			if (loadersWaiting.current) return

			const prevPage = Math.max(firstPage - 1, 0)
			await loadPage(prevPage)
		})
	}, [pageSize, state, loadPage, totalCount, updateRenderItems])

	const setRenderWindow = useCallback(
		(first: number, last: number) => {
			state.firstIndex = first
			state.lastIndex = last

			updateRenderItems()
			ensurePages()
		},
		[state, ensurePages, updateRenderItems],
	)

	const { renderItems } = useSnapshot(state)

	return {
		renderItems,
		setRenderWindow,
	}
}

function getRenderItems<T>(firstIndex: number, lastIndex: number, pages: Page<T>[]) {
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
