import { describe, expect, it } from "vitest"
import { compareItems, groupMap, plural } from "./helpers"

describe("compareItems", () => {
    const keyFn = (item: { id: number }) => item.id

    it("should handle empty arrays", () => {
        const result = compareItems([], [], keyFn)
        expect(result.added).toEqual([])
        expect(result.removed).toEqual([])
        expect(result.changed).toEqual([])
        expect(result.same).toEqual([])
        expect(result.itemsChanged).toBe(false)
    })

    it("should identify added items", () => {
        const a = [{ id: 1, name: "item1" }]
        const b = [
            { id: 1, name: "item1" },
            { id: 2, name: "item2" },
        ]
        const result = compareItems(a, b, keyFn)
        expect(result.added).toEqual([{ id: 2, name: "item2" }])
        expect(result.removed).toEqual([])
        expect(result.changed).toEqual([])
        expect(result.same).toEqual([{ id: 1, name: "item1" }])
        expect(result.itemsChanged).toBe(true)
    })

    it("should identify removed items", () => {
        const a = [
            { id: 1, name: "item1" },
            { id: 2, name: "item2" },
        ]
        const b = [{ id: 1, name: "item1" }]
        const result = compareItems(a, b, keyFn)
        expect(result.added).toEqual([])
        expect(result.removed).toEqual([{ id: 2, name: "item2" }])
        expect(result.changed).toEqual([])
        expect(result.same).toEqual([{ id: 1, name: "item1" }])
        expect(result.itemsChanged).toBe(true)
    })

    it("should identify changed items", () => {
        const a = [{ id: 1, name: "item1" }]
        const b = [{ id: 1, name: "item1-changed" }]
        const result = compareItems(a, b, keyFn)
        expect(result.added).toEqual([])
        expect(result.removed).toEqual([])
        expect(result.changed).toEqual([{ id: 1, name: "item1-changed" }])
        expect(result.same).toEqual([])
        expect(result.itemsChanged).toBe(true)
    })

    it("should respect ignoreObjects parameter", () => {
        const a = [{ id: 1, name: "item1", data: { foo: "bar" } }]
        const b = [{ id: 1, name: "item1", data: { foo: "baz" } }] // different object reference

        // Without ignoreObjects, they are considered changed because data is a different object
        const result1 = compareItems(a, b, keyFn, { ignoreObjects: false })
        expect(result1.changed).toEqual(b)
        expect(result1.same).toEqual([])

        // With ignoreObjects, they are considered same because the object property is skipped
        const result2 = compareItems(a, b, keyFn, { ignoreObjects: true })
        expect(result2.changed).toEqual([])
        expect(result2.same).toEqual(b)
    })

    it("should respect ignoreFunctions parameter", () => {
        const a = [{ id: 1, name: "item1", fn: () => "foo" }]
        const b = [{ id: 1, name: "item1", fn: () => "bar" }] // different function reference

        // Without ignoreFunctions, they are considered changed
        const result1 = compareItems(a, b, keyFn, { ignoreFunctions: false })
        expect(result1.changed).toEqual(b)
        expect(result1.same).toEqual([])

        // With ignoreFunctions, they are considered same
        const result2 = compareItems(a, b, keyFn, { ignoreFunctions: true })
        expect(result2.changed).toEqual([])
        expect(result2.same).toEqual(b)
    })

    it("should handle complex scenarios", () => {
        const a = [
            { id: 1, name: "same" },
            { id: 2, name: "removed" },
            { id: 3, name: "changed-old" },
        ]
        const b = [
            { id: 1, name: "same" },
            { id: 3, name: "changed-new" },
            { id: 4, name: "added" },
        ]
        const result = compareItems(a, b, keyFn)
        expect(result.added).toEqual([{ id: 4, name: "added" }])
        expect(result.removed).toEqual([{ id: 2, name: "removed" }])
        expect(result.changed).toEqual([{ id: 3, name: "changed-new" }])
        expect(result.same).toEqual([{ id: 1, name: "same" }])
    })
})

describe("plural", () => {
    it("returns s or not", () => {
        expect(plural(0)).toBe("s")
        expect(plural(1)).toBe("")
        expect(plural(7)).toBe("s")
    })

    it("pluralizes the provided word", () => {
        expect(plural(1, "image")).toBe("image")
        expect(plural(7, "image")).toBe("images")
    })

    it("pluralizes the provided word with a custom plural", () => {
        expect(plural(1, "child", "children")).toBe("child")
        expect(plural(7, "child", "children")).toBe("children")
    })
})

describe("groupMap", () => {
    it("should group items by key using default groupFn", () => {
        const items = [
            { id: 1, category: "A" },
            { id: 2, category: "B" },
            { id: 3, category: "A" },
        ]
        const result = groupMap(items, (item) => [item.category, item])
        expect(result).toEqual([
            { group: "A", items: [items[0], items[2]] },
            { group: "B", items: [items[1]] },
        ])
    })

    it("should map values using itemFn", () => {
        const items = [
            { id: 1, category: "A" },
            { id: 2, category: "B" },
            { id: 3, category: "A" },
        ]
        const result = groupMap(items, (item) => [item.category, item.id])
        expect(result).toEqual([
            { group: "A", items: [1, 3] },
            { group: "B", items: [2] },
        ])
    })

    it("should use custom groupFn", () => {
        const items = [
            { id: 1, category: "A" },
            { id: 2, category: "B" },
            { id: 3, category: "A" },
        ]
        const result = groupMap(
            items,
            (item) => [item.category, item.id],
            (key, values) => ({ cat: key, ids: values, count: values.length }),
        )
        expect(result).toEqual([
            { cat: "A", ids: [1, 3], count: 2 },
            { cat: "B", ids: [2], count: 1 },
        ])
    })

    it("should handle empty arrays", () => {
        const result = groupMap([] as unknown[], (item) => ["key", item])
        expect(result).toEqual([])
    })

    it("should provide index and array to itemFn", () => {
        const items = ["a", "b", "c"]
        const result = groupMap(items, (item, index) => [index % 2 === 0 ? "even" : "odd", item])
        expect(result).toEqual([
            { group: "even", items: ["a", "c"] },
            { group: "odd", items: ["b"] },
        ])
    })
})
