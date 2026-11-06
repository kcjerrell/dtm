// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { proxy } from "valtio"
import { batch } from "valtio-reactive"
import { afterEach, describe, expect, it, vi } from "vitest"
import { getCollections } from "./collections"
import { getItemFactory } from "./MediaItem"
import type { MediaStateCol, MediaStoreApi, MediaStoreType } from "./types"

vi.mock("@/metadata/state/imageLoaders", () => ({}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const roots: Root[] = []
afterEach(async () => {
    await act(async () => {
        for (const root of roots) root.unmount()
    })
    roots.length = 0
})

function renderHook<T>(useValue: () => T) {
    const result = {} as { current: T }
    function Harness() {
        result.current = useValue()
        return null
    }
    const root = createRoot(document.createElement("div"))
    roots.push(root)
    act(() => root.render(<Harness />))
    return { result }
}

function stored(id: string, state = { selected: false }): MediaStateCol {
    return {
        id,
        type: "png",
        source: {},
        url: `${id}.png`,
        thumbUrl: `${id}.png`,
        storage: { kind: "app", fname: `${id}.png` },
        createdAt: 0,
        $col: { a: state },
    }
}

function setup() {
    const store = proxy<MediaStoreType>({ items: [] })
    const api: MediaStoreApi = {
        save: vi.fn(),
        remove: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
        addExistingToCollection: vi.fn().mockResolvedValue("item"),
        waitForReady: async () => {},
    }
    const factory = vi.fn(getItemFactory("a", { selected: false }))
    const changed = vi.fn()
    const registry = getCollections(store, api)
    const collection = registry.defineCollection(
        "a",
        { selected: false },
        {
            itemFactory: factory,
            onItemsChanged: changed,
        },
    )
    return { store, factory, changed, collection, registry }
}

describe("collection-owned mapping", () => {
    it("caches by both store item and collection state, preserving live proxy views", async () => {
        const { store, factory, collection, registry } = setup()
        const shared = { selected: false }
        store.items.push(stored("one", shared), stored("two", shared))
        const other = registry.defineCollection("b", { selected: false })
        store.items[0].$col.b = { selected: false }
        await Promise.all([collection.waitForReady(), other.waitForReady()])
        const [one, two] = collection.items
        expect(one.id).toBe("one")
        expect(two.id).toBe("two")
        expect(one).not.toBe(two)
        expect(other.items[0]).not.toBe(one)
        expect(factory).toHaveBeenCalledTimes(2)
        one.selected = true
        expect(store.items[0].$col.a.selected).toBe(true)
        expect(two.selected).toBe(true)
        expect(collection.items[0]).toBe(one)
        expect(factory).toHaveBeenCalledTimes(2)

        store.items[0].$col.a = { selected: false }
        const replacement = collection.items[0]
        expect(replacement).not.toBe(one)
        expect(replacement.cState).toBe(store.items[0].$col.a)
        expect(collection.items[1]).toBe(two)
        expect(factory).toHaveBeenCalledTimes(3)
        delete store.items[0].$col.a
        expect(collection.items).toEqual([two])
        store.items[0].$col.a = { selected: true }
        expect(collection.items[0]).not.toBe(replacement)
        expect(other.items).toHaveLength(1)
    })

    it("notifies on same-length replacement and reorder, coalescing synchronous edits", async () => {
        const { store, collection, changed } = setup()
        await collection.waitForReady()
        store.items.push(stored("one"), stored("two"))
        await Promise.resolve()
        changed.mockClear()
        store.items[0] = stored("three")
        await Promise.resolve()
        expect(changed).toHaveBeenCalledOnce()
        changed.mockClear()
        batch(() => store.items.reverse())
        await Promise.resolve()
        expect(changed).toHaveBeenCalledOnce()
        expect(collection.items.map((item) => item.id)).toEqual(["two", "three"])
        changed.mockClear()
        collection.items[0].selected = true
        await Promise.resolve()
        expect(changed).not.toHaveBeenCalled()
    })

    it("skips a failed view, keeps raw membership, and retries on subsequent computation", async () => {
        const { store, factory, collection } = setup()
        await collection.waitForReady()
        const log = vi.spyOn(console, "error").mockImplementation(() => {})
        try {
            factory.mockImplementation(() => {
                throw new Error("broken view")
            })
            store.items.push(stored("one"))
            expect(collection.items).toEqual([])
            expect(store.items[0].$col.a).toEqual({ selected: false })
            factory.mockImplementation(getItemFactory("a", { selected: false }))
            store.items.push(stored("two"))
            expect(collection.items.map((item) => item.id)).toEqual(["one", "two"])
            expect(log).toHaveBeenCalledWith("a factory failed for one:", expect.any(Error))
        } finally {
            log.mockRestore()
        }
    })
})

describe("mapped-item hooks", () => {
    it("updates from hydration without waiting for collection initialization", async () => {
        const { store, collection } = setup()
        const { result } = renderHook(() => collection.useItemsState())
        expect(result.current).toEqual([])
        await act(async () => {
            store.items = [stored("restored")]
        })
        expect(result.current[0].id).toBe("restored")
        expect(result.current[0]).toBe(collection.items[0])
        await act(async () => {
            result.current[0].selected = true
        })
        expect(store.items[0].$col.a.selected).toBe(true)
    })

    it("returns live wrappers and follows additions, same-length replacement, reorder, and removal", async () => {
        const { store, collection } = setup()
        await collection.waitForReady()
        const { result } = renderHook(() => collection.useItemsState())
        expect(result.current).toEqual([])
        await act(async () => {
            store.items.push(stored("one"), stored("two"))
        })
        expect(result.current[0]).toBe(collection.items[0])
        const two = result.current[1]
        await act(async () => {
            store.items[0] = stored("three")
        })
        expect(result.current.map((item) => item.id)).toEqual(["three", "two"])
        expect(result.current[1]).toBe(two)
        await act(async () => {
            batch(() => store.items.reverse())
        })
        expect(result.current.map((item) => item.id)).toEqual(["two", "three"])
        await act(async () => {
            store.items[0].$col.a = { selected: true }
        })
        expect(result.current[0]).not.toBe(two)
        expect(result.current[0]).toBe(collection.items[0])
        await act(async () => {
            delete store.items[0].$col.a
        })
        expect(result.current.map((item) => item.id)).toEqual(["three"])
    })

    it("refilters on snapshot property edits while returning mutable mapped items", async () => {
        const { store, collection } = setup()
        store.items.push(stored("one"), stored("two", { selected: true }))
        await collection.waitForReady()
        const { result } = renderHook(() => collection.useFilterMapItems((item) => item.selected))
        expect(result.current).toEqual([collection.items[1]])
        expect(result.current[0]).toBe(collection.items[1])
        await act(async () => {
            collection.items[0].selected = true
        })
        expect(result.current).toEqual(collection.items)
        await act(async () => {
            result.current[1].selected = false
        })
        expect(result.current).toEqual([collection.items[0]])
        await act(async () => {
            store.items[0] = stored("three", { selected: true })
        })
        expect(result.current[0]).toBe(collection.items[0])
        expect(result.current[0].id).toBe("three")
    })
})
