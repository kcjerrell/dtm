import { Mutex } from "async-mutex"
import { proxy, type Snapshot, useSnapshot } from "valtio"
import va from "./array"

export interface IVirtualItemSource<T> {
	// useRenderItems(): Snapshot<T[]>
	renderItems: PagedItem<T>[]
	setRenderWindow(first: number, last: number): void
	totalCount: number
}

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

class PagedItemSource<T> {
	state = proxy<PagedItemSourceState<T>>({
		pages: [],
		renderItems: [],
		firstIndex: 0,
		lastIndex: 0,
	})

	getItems: PagedItemsGetter<T>
	pageSize: number
	totalCount: number

	private pageLoader = new Mutex()
	private loadersWaiting = 0

	constructor(getItems: PagedItemsGetter<T>, pageSize: number, totalCount: number) {
		this.getItems = getItems
		this.pageSize = pageSize
		this.totalCount = totalCount
	}

	setTotalCount(totalCount: number) {
		this.totalCount = totalCount
	}

	private async loadPage(index: number) {
		if (this.state.pages[index]) return false
		const page = await this.getItems(index * this.pageSize, this.pageSize)
		if (!page || page.length === 0) return false
		this.state.pages[index] = {
			from: index * this.pageSize,
			to: (index + 1) * this.pageSize - 1,
			items: [...page],
		}
		return true
	}

	private getRenderItems(firstIndex: number, lastIndex: number) {
		const pages = this.state.pages

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

	private updateRenderItems() {
		va.set(
			this.state.renderItems,
			this.getRenderItems(
				this.state.firstIndex,
				Math.min(this.state.lastIndex, this.totalCount - 1),
			),
		)
	}

	private async ensurePages() {
		if (!this.totalCount) return

		this.loadersWaiting++

		await this.pageLoader.runExclusive(async () => {
			this.loadersWaiting--
			const { firstIndex, lastIndex } = this.state

			const firstPage = Math.floor(firstIndex / this.pageSize)
			const lastPage = Math.floor(lastIndex / this.pageSize)

			let pagesLoaded = 0

			for (let i = firstPage; i <= lastPage; i++) {
				if (await this.loadPage(i)) pagesLoaded++
			}

			if (pagesLoaded) this.updateRenderItems()

			if (this.loadersWaiting) return

			const nextPage = Math.min(lastPage + 1, Math.ceil(this.totalCount / this.pageSize) - 1)
			await this.loadPage(nextPage)

			if (this.loadersWaiting) return

			const prevPage = Math.max(firstPage - 1, 0)
			await this.loadPage(prevPage)
		})
	}

	/** this is a react hook, and must follow the rules of hooks */
	useRenderItems() {
		return useSnapshot(this.state).renderItems
	}

	setRenderWindow(first: number, last: number) {
		this.state.firstIndex = first
		this.state.lastIndex = last
		this.updateRenderItems()
		this.ensurePages()
	}
}

export default PagedItemSource
