import type { ControlValue, GeneratedControl, SelectedInput } from "../contracts"

export interface RuntimeControl {
    descriptor: GeneratedControl
    value: ControlValue | null
    selection: SelectedInput | null
    touched: boolean
    notice: string | null
    error: string | null
    draft: string | null
    selecting: boolean
}

export function valueType(control: GeneratedControl): ControlValue["type"] | "image" {
    return control.type === "slider" ? "number" : control.type
}

export function defaultValue(control: GeneratedControl): ControlValue | null {
    switch (control.type) {
        case "image":
            return null
        case "slider":
        case "number":
            return { type: "number", value: control.defaultValue }
        case "boolean":
            return { type: "boolean", value: control.defaultValue }
        case "text":
            return { type: "text", value: control.defaultValue }
    }
}

/** Clamp to bounds and the nearest step, anchored at min (or zero).
 * Step is a runtime constraint, including for values supplied by source defaults. */
export function normalizeValue(
    control: GeneratedControl,
    value: ControlValue,
): { value: ControlValue; notice: string | null } {
    if (value.type !== valueType(control)) throw new Error("Control value type mismatch")
    if (value.type !== "number" || (control.type !== "number" && control.type !== "slider"))
        return { value: { ...value }, notice: null }
    if (!Number.isFinite(value.value)) throw new Error("Enter a finite number.")
    const min = control.min ?? -Infinity
    const max = control.max ?? Infinity
    let next = Math.max(min, Math.min(max, value.value))
    if (control.step !== undefined) {
        const anchor = control.min ?? 0
        const units = (next - anchor) / control.step
        // Extreme finite constraints may overflow intermediate arithmetic. Bounds
        // still apply; do not turn a finite runtime value into NaN or Infinity.
        if (Number.isFinite(units)) {
            const lowerUnits = (min - anchor) / control.step
            const upperUnits = (max - anchor) / control.step
            const tolerance = (units: number) =>
                Number.isFinite(units) ? Number.EPSILON * Math.max(1, Math.abs(units)) * 4 : 0
            const lower = Math.ceil(lowerUnits - tolerance(lowerUnits))
            const upper = Math.floor(upperUnits + tolerance(upperUnits))
            const steps = Math.max(lower, Math.min(upper, Math.round(units)))
            const stepped = anchor + steps * control.step
            if (Number.isFinite(stepped))
                next = Math.max(min, Math.min(max, Number(stepped.toPrecision(15))))
        }
    }
    return {
        value: { type: "number", value: next },
        notice:
            next === value.value
                ? null
                : `Adjusted from ${value.value} to ${next} to fit the numeric constraints.`,
    }
}

/** Validate the complete schema before changing any runtime state. */
export function validateSchema(controls: readonly GeneratedControl[], sourceLength: number): void {
    const ids = new Set<string>()
    for (const control of controls) {
        if (!control.id || ids.has(control.id))
            throw new Error("Control schema contains an empty or duplicate ID.")
        ids.add(control.id)
        const { start, end } = control.sourceRange
        if (
            !Number.isInteger(start.offset) ||
            !Number.isInteger(end.offset) ||
            start.offset < 0 ||
            end.offset < start.offset ||
            end.offset > sourceLength
        )
            throw new Error("Control schema contains an invalid source range.")
        if (control.type !== "number" && control.type !== "slider") continue
        if (
            ![control.defaultValue, control.min, control.max, control.step].every(
                (v) => v === undefined || Number.isFinite(v),
            ) ||
            (control.min !== undefined && control.max !== undefined && control.min > control.max) ||
            (control.step !== undefined && control.step <= 0)
        )
            throw new Error("Control schema contains invalid numeric constraints.")
    }
}

export function reconcileControls(
    previous: readonly RuntimeControl[],
    controls: readonly GeneratedControl[],
): RuntimeControl[] {
    const old = new Map(previous.map((item) => [item.descriptor.id, item]))
    return controls.map((descriptor) => {
        const prior = old.get(descriptor.id)
        const compatible = prior && valueType(prior.descriptor) === valueType(descriptor)
        const touched = Boolean(compatible && prior.touched)
        const candidate = touched ? prior?.value : defaultValue(descriptor)
        const normalized = candidate
            ? normalizeValue(descriptor, candidate)
            : { value: null, notice: null }
        return {
            descriptor: structuredClone(descriptor),
            value: normalized.value,
            selection: compatible && prior.selection ? { ...prior.selection } : null,
            touched,
            notice: normalized.notice ?? (touched ? (prior?.notice ?? null) : null),
            error: null,
            draft: null,
            selecting: false,
        }
    })
}
