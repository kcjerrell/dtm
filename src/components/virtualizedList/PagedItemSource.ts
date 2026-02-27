import { Mutex } from "async-mutex"
import { proxy, type Snapshot, useSnapshot } from "valtio"

export interface IItemSource<T> {
	get renderItems(): T[]
	getTotalCount(): number
	clearItems(): Promise<void>
	get renderWindow(): [number, number]
	set renderWindow(value: [number, number])
	get activeItemIndex(): number | undefined
	set activeItemIndex(value: number | undefined)
	// selectItem(item: T): T | undefined
	// selectIndex: (index: number) => T | undefined
	useItemSource: () => Snapshot<PagedItemSourceState<T>>
}

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

type PagedItemSourceOpts<T> = {
	getItems: (skip: number, take: number) => Promise<T[] | undefined>
	/** use a fixed page size */
	pageSize: number
	/** any items beyond this number will be ignored */
	getCount: () => Promise<number>
	onActiveItemChanged?: (item: PagedItem<T>, index: number | undefined) => void
}

type PagedItemSourceState<T> = {
	renderItems: PagedItem<T>[]
	firstIndex: number
	lastIndex: number
	totalCount: number
	activeItemIndex?: number
	activeItem?: T
	hasInitialLoad: boolean
}

export class PagedItemSource<T> implements IItemSource<T> {
		state: PagedItemSourceState<T>
		pages = proxy([]) as Page<T>[]
		readonly getItems: PagedItemSourceOpts<T>["getItems"]
		readonly getCount: PagedItemSourceOpts<T>["getCount"]
		readonly pageSize: number

		pageLoader = new Mutex()
		loadersWaiting = 0
		onActiveItemChanged: ((item: PagedItem<T>, index: number | undefined) => void) | undefined

		constructor(opts: PagedItemSourceOpts<T>) {
			this.state = proxy({
				renderItems: [] as PagedItem<T>[],
				firstIndex: 0,
				lastIndex: 0,
				totalCount: 0,
				activeItemIndex: undefined,
				activeItem: undefined,
				hasInitialLoad: false,
			})

			this.getItems = opts.getItems
			this.getCount = opts.getCount
			this.pageSize = opts.pageSize
			this.onActiveItemChanged = opts.onActiveItemChanged
		}

		async loadPage(index: number, refresh = false) {
			if (this.pages[index] && !refresh) return false
			const page = await this.getItems(index * this.pageSize, this.pageSize)
			if (!page || page.length === 0) return false
			this.pages[index] = {
				from: index * this.pageSize,
				to: (index + 1) * this.pageSize - 1,
				items: [...page],
			}
			this.state.hasInitialLoad = true
			return true
		}

		updateRenderItems() {
			this.state.renderItems = getRenderItems(
				this.state.firstIndex,
				Math.min(this.state.lastIndex, this.state.totalCount - 1),
				this.pages,
			)
		}

		async ensurePages(refresh = false, clearOthers = false) {
			if (!this.state.totalCount) {
				this.state.totalCount = await this.getCount()
				if (this.state.totalCount === 0) return
			}
			this.loadersWaiting++
			// mutex is used to prevent spamming multiple requests for the same page
			// if this turns out to be slow, we mark individual pages as loading
			// allowing for simultaneous requests for different pages
			await this.pageLoader.runExclusive(async () => {
				this.loadersWaiting--
				const { firstIndex, lastIndex } = this.state

				const firstPage = Math.floor(firstIndex / this.pageSize)
				const lastPage = Math.floor(lastIndex / this.pageSize)

				if (clearOthers) {
					this.pages = this.pages.filter(
						(p) =>
							p.from >= firstPage * this.pageSize && p.to <= lastPage * this.pageSize,
					)
				}

				let pagesLoaded = 0

				for (let i = firstPage; i <= lastPage; i++) {
					if (await this.loadPage(i, refresh)) pagesLoaded++
				}

				if (pagesLoaded) this.updateRenderItems()

				if (this.loadersWaiting) return

				// if not, let's check for the neighboring pages
				const nextPage = Math.min(
					lastPage + 1,
					Math.ceil(this.state.totalCount / this.pageSize) - 1,
				)
				await this.loadPage(nextPage)

				if (this.loadersWaiting) return

				const prevPage = Math.max(firstPage - 1, 0)
				await this.loadPage(prevPage)
			})
		}

		get renderItems(): T[] {
			return this.state.renderItems as T[]
		}
		getTotalCount(): number {
			return this.state.totalCount
		}
		async clearItems(): Promise<void> {
			this.state.totalCount = await this.getCount()

			const windowSize = this.state.lastIndex - this.state.firstIndex + 1
			this.state.lastIndex = Math.min(this.state.totalCount - 1, this.state.lastIndex)
			this.state.firstIndex = Math.max(0, this.state.lastIndex - windowSize + 1)

			this.ensurePages(true, true)
		}
		get renderWindow(): [number, number] {
			return [this.state.firstIndex, this.state.lastIndex]
		}
		set renderWindow(value: [number, number]) {
			this.state.firstIndex = value[0]
			this.state.lastIndex = value[1]

			this.updateRenderItems()
			this.ensurePages()
		}
		get activeItemIndex(): number | undefined {
			return this.state.activeItemIndex
		}
		set activeItemIndex(value: number | null | undefined) {
			// TODO check
			if (value === null || value === undefined) {
				this.state.activeItemIndex = undefined
				return
			}
			if (value < 0 || value >= this.state.totalCount) return

			this.state.activeItemIndex = value
			this.loadPage(this.getItemPage(value)).then(() => {
				const item =
					this.pages[this.getItemPage(value)].items[
						value - this.pages[this.getItemPage(value)].from
					]
				if (item) this.state.activeItem = item
				this.onActiveItemChanged?.(item, value)
			})
		}

		useItemSource() {
			return useSnapshot(this.state)
		}

		getItemPage(itemIndex: number) {
			return Math.floor(itemIndex / this.pageSize)
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

export class EmptyItemSource<T> implements IItemSource<T> {
	private state: PagedItemSourceState<T>

	constructor() {
		this.state = proxy({
			renderItems: [] as PagedItem<T>[],
			firstIndex: 0,
			lastIndex: 0,
			totalCount: 0,
			activeItemIndex: undefined,
			activeItem: undefined,
			hasInitialLoad: true,
		})
	}

	get renderItems(): T[] {
		return []
	}

	getTotalCount(): number {
		return 0
	}

	async clearItems(): Promise<void> {
		// Nothing to clear
	}

	get renderWindow(): [number, number] {
		return [0, 0]
	}

	set renderWindow(_value: [number, number]) {
		// No-op for empty source
	}

	get activeItemIndex(): number | undefined {
		return undefined
	}

	set activeItemIndex(_value: number | undefined) {
		// No-op for empty source
	}

	useItemSource() {
		return useSnapshot(this.state)
	}
}
