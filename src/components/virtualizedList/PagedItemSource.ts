import { Mutex } from "async-mutex"
import { useCallback, useEffect, useRef } from "react"
import { proxy, useSnapshot } from "valtio"
import { useInit } from "@/hooks/useInitRef"

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

type UsePagedItemSourceOpts<T> = {
	getItems: (skip: number, take: number) => Promise<T[] | undefined>
	/** use a fixed page size */
	pageSize: number
	/** any items beyond this number will be ignored */
	getCount: () => Promise<number>
}

export function usePagedItemSource<T>(opts: UsePagedItemSourceOpts<T>) {
	const { getItems, pageSize, getCount } = opts

	const state = useInit(() =>
		proxy({
			pages: [] as Page<T>[],
			renderItems: [] as PagedItem<T>[],
			firstIndex: 0,
			lastIndex: 0,
			pageSize,
			totalCount: 0,
		}),
	)

	const getterRef = useRef({ getItems, getCount })

	useEffect(() => {
		const getters = getterRef.current
		if (getters.getItems !== getItems || getters.getCount !== getCount) {
			getterRef.current = { getItems, getCount }
			state.pages = []
			state.renderItems = []
			state.firstIndex = 0
			state.lastIndex = 0
			state.totalCount = 0
		}
		getterRef.current = { getItems, getCount }
	}, [getItems, getCount, state])

	useEffect(() => {
		getCount().then((count) => {
			state.totalCount = count
		})
	}, [getCount, state])

	const pageLoader = useRef(new Mutex())
	const loadersWaiting = useRef(0)

	/** returns true if a new page was loaded */
	const loadPage = useCallback(
		async (index: number, refresh = false) => {
			if (state.pages[index] && !refresh) return false
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
			Math.min(state.lastIndex, state.totalCount - 1),
			state.pages,
		)
	}, [state])

	const ensurePages = useCallback(
		async (refresh = false, clearOthers = false) => {
			if (!state.totalCount) return
			loadersWaiting.current++
			// mutex is used to prevent spamming multiple requests for the same page
			// if this turns out to be slow, we mark individual pages as loading
			// allowing for simultaneous requests for different pages
			await pageLoader.current.runExclusive(async () => {
				loadersWaiting.current--
				const { firstIndex, lastIndex } = state

				const firstPage = Math.floor(firstIndex / pageSize)
				const lastPage = Math.floor(lastIndex / pageSize)

				if (clearOthers) {
					state.pages = state.pages.filter(
						(p) => p.from >= firstPage * pageSize && p.to <= lastPage * pageSize,
					)
				}

				let pagesLoaded = 0

				for (let i = firstPage; i <= lastPage; i++) {
					if (await loadPage(i, refresh)) pagesLoaded++
				}

				if (pagesLoaded) updateRenderItems()

				if (loadersWaiting.current) return

				// if not, let's check for the neighboring pages
				const nextPage = Math.min(lastPage + 1, Math.ceil(state.totalCount / pageSize) - 1)
				await loadPage(nextPage)

				if (loadersWaiting.current) return

				const prevPage = Math.max(firstPage - 1, 0)
				await loadPage(prevPage)
			})
		},
		[pageSize, state, loadPage, updateRenderItems],
	)

	const setRenderWindow = useCallback(
		(first: number, last: number) => {
			state.firstIndex = first
			state.lastIndex = last

			updateRenderItems()
			ensurePages()
		},
		[state, ensurePages, updateRenderItems],
	)

	// refresh items when the source may have changed (e.g. items were added/removed)
	// if the source has changed significantly, use a new item source
	// this attempts to keep the UI stable when the source changes
	const refreshItems = useCallback(async () => {
		state.totalCount = await getCount()

		const windowSize = state.lastIndex - state.firstIndex + 1
		state.lastIndex = Math.min(state.totalCount - 1, state.lastIndex)
		state.firstIndex = Math.max(0, state.lastIndex - windowSize + 1)

		ensurePages(true, true)
	}, [state, getCount, ensurePages])

	const { renderItems, totalCount } = useSnapshot(state)

	return {
		renderItems,
		totalCount,
		clearItems: refreshItems,
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
