import { describe, it, expect } from "vitest"
import { compareItems } from "./helpers"

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
