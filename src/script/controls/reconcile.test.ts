import { expect, it } from "vitest"
import type { GeneratedControl } from "../contracts"
import { normalizeValue, validateSchema } from "./reconcile"

const numeric: GeneratedControl = {
    id: "n",
    label: "Number",
    type: "slider",
    defaultValue: 0,
    min: 0,
    max: 0.3,
    step: 0.1,
    sourceRange: {
        start: { offset: 0, line: 1, column: 1 },
        end: { offset: 1, line: 1, column: 2 },
    },
}

it("preserves decimal step endpoints and normalizes floating-point rounding", () => {
    expect(normalizeValue(numeric, { type: "number", value: 0.3 }).value.value).toBe(0.3)
    expect(normalizeValue(numeric, { type: "number", value: 0.1 + 0.2 }).value.value).toBe(0.3)
    expect(
        normalizeValue({ ...numeric, min: -0.3, max: 0.3 }, { type: "number", value: -0.26 }).value
            .value,
    ).toBe(-0.3)
})

it("rejects malformed schema constraints/ranges before reconciliation", () => {
    expect(() => validateSchema([numeric], 0)).toThrow("source range")
    expect(() => validateSchema([{ ...numeric, step: 0 }], 1)).toThrow("numeric constraints")
    expect(() => validateSchema([{ ...numeric, min: 5, max: 1 }], 1)).toThrow("numeric constraints")
    expect(() => validateSchema([{ ...numeric, defaultValue: NaN }], 1)).toThrow(
        "numeric constraints",
    )
})

it("does not turn extreme finite numeric values into non-finite run data", () => {
    const result = normalizeValue(
        { ...numeric, min: -Number.MAX_VALUE, max: Number.MAX_VALUE, step: Number.MIN_VALUE },
        { type: "number", value: Number.MAX_VALUE },
    )
    expect(Number.isFinite(result.value.value)).toBe(true)
})
