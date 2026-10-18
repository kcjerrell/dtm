import { runInNewContext } from "node:vm"

import { describe, expect, it } from "vitest"

import type { SourceRevision } from "../contracts"
import { analyzeScript } from "."

const revision = 7 as SourceRevision
const analyze = (source: string) => analyzeScript({ source, sourceRevision: revision })

describe("analyzeScript", () => {
    it("ignores comments, strings, unrelated receivers, and shadowed nested parameters", () => {
        const result = analyze(`
// createImageProcess(async (dtm) => dtm.param(1))
const text = "dtm.param(2)"
createImageProcess(async (dtm) => {
  other.param(3)
  const nested = (dtm: OtherContext) => dtm.param(4)
  const realValue = dtm.param(5)
})`)
        expect(result.diagnostics).toEqual([])
        expect(result.controls).toHaveLength(1)
        expect(result.controls[0]).toMatchObject({ label: "Real Value", defaultValue: 5 })
        expect(result.instrumentedSource).toContain("other.param(3)")
        expect(result.instrumentedSource).toContain("dtm.param(4)")
    })

    it("rejects nested controls capturing the real callback parameter", () => {
        for (const nested of [
            "const value = () => dtm.param(1); value()",
            "function input() { return dtm.input() }; input()",
            "[1].map(() => (() => dtm.param(1))())",
            "const object = { value() { return dtm.param(1) } }",
        ]) {
            const source = `createImageProcess(async (dtm) => { ${nested} })`
            const result = analyze(source)
            expect(result.controls).toEqual([])
            expect(result.instrumentedSource).toBeUndefined()
            expect(result.diagnostics).toEqual([
                expect.objectContaining({
                    code: "nested-control",
                    location: expect.objectContaining({
                        range: expect.objectContaining({
                            start: expect.objectContaining({ offset: source.indexOf("dtm.") }),
                        }),
                    }),
                }),
            ])
        }
        const concise = analyze("createImageProcess((dtm) => () => dtm.param(1))")
        expect(concise.diagnostics).toEqual([expect.objectContaining({ code: "nested-control" })])
        expect(concise.instrumentedSource).toBeUndefined()
    })

    it("matches the callback parameter by binding identity", () => {
        const result = analyze(`createImageProcess(async (dtm) => {
 const before = dtm.param(true)
 { const dtm = other; dtm.param(false) }
 const after = dtm.param("ok")
})`)
        expect(result.controls.map((control) => control.type)).toEqual(["boolean", "text"])
    })

    it("does not recognize a locally declared or imported registration function", () => {
        const local = analyze(`const createImageProcess = (callback: unknown) => callback
createImageProcess(async (dtm) => dtm.param(1))`)
        expect(local.controls).toEqual([])
        expect(local.diagnostics).toEqual([
            expect.objectContaining({ source: "analyzer", code: "registration-count" }),
        ])

        const imported = analyze(`import { createImageProcess } from "other"
createImageProcess(async (dtm) => dtm.param(1))`)
        expect(imported.controls).toEqual([])
        expect(imported.diagnostics).toEqual([
            expect.objectContaining({ source: "analyzer", code: "registration-count" }),
        ])
    })

    it("returns useful ranged diagnostics for incomplete and invalid source", () => {
        const incomplete = analyze("createImageProcess(async (dtm) => { const amount = dtm.param(")
        expect(incomplete.diagnostics).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ source: "typescript", severity: "error" }),
            ]),
        )
        expect(incomplete.instrumentedSource).toBeUndefined()

        const invalid = analyze("createImageProcess(async (dtm) => dtm.param(value))")
        const diagnostic = invalid.diagnostics.find((entry) => entry.code === "unsupported-call")
        expect(diagnostic?.location?.range.start).toEqual({ line: 1, column: 35, offset: 34 })
        expect(diagnostic?.message).toContain("static")
        expect(invalid.instrumentedSource).toBeUndefined()
    })

    it("infers labels from variables and conditional initializers", () => {
        const result = analyze(`createImageProcess(async (dtm) => {
 const guidanceScale = enabled ? dtm.param(7) : dtm.param(8)
 const source_image = await dtm.input()
})`)
        expect(result.controls.map((control) => control.label)).toEqual([
            "Guidance Scale",
            "Guidance Scale",
            "Source image",
        ])
    })

    it("uses explicit IDs and rejects duplicate explicit or generated IDs", () => {
        const explicit = analyze(`createImageProcess(async (dtm) => {
 dtm.param(1, { id: "strength", label: "Strength" })
 dtm.input({ id: "strength" })
})`)
        expect(explicit.controls[0].id).toBe("strength")
        expect(explicit.diagnostics).toEqual(
            expect.arrayContaining([expect.objectContaining({ code: "duplicate-id" })]),
        )
        expect(explicit.instrumentedSource).toBeUndefined()

        const first = analyze("createImageProcess(async (dtm) => dtm.param(1))")
        const second = analyze("createImageProcess(async (dtm) => dtm.param(1))")
        expect(first.controls[0].id).toBe(second.controls[0].id)
    })

    it("normalizes both constrained numeric overloads to slider descriptors", () => {
        const result = analyze(`createImageProcess(async (dtm) => {
 const first = dtm.param(0, { min: -1, max: 1, step: .1 })
 const second = dtm.param(0, -1, 1, .1)
 const integer = dtm.param(2, 0, 10)
})`)
        expect(result.controls).toEqual([
            expect.objectContaining({
                type: "slider",
                defaultValue: 0,
                min: -1,
                max: 1,
                step: 0.1,
            }),
            expect.objectContaining({
                type: "slider",
                defaultValue: 0,
                min: -1,
                max: 1,
                step: 0.1,
            }),
            expect.objectContaining({ type: "slider", defaultValue: 2, min: 0, max: 10, step: 1 }),
        ])
    })

    it("normalizes an omitted object step like the positional overload", () => {
        const objectResult = analyze(`createImageProcess(async (dtm) => {
 const strength = dtm.param(0, { min: 0, max: 10 })
})`)
        const positionalResult = analyze(`createImageProcess(async (dtm) => {
 const strength = dtm.param(0, 0, 10)
})`)
        const { sourceRange: _objectRange, ...objectControl } = objectResult.controls[0]
        const { sourceRange: _positionalRange, ...positionalControl } = positionalResult.controls[0]
        expect(objectControl).toEqual(positionalControl)
        expect(objectControl).toMatchObject({ type: "slider", min: 0, max: 10, step: 1 })
    })

    it("validates static overloads and constraints", () => {
        const cases = [
            "dtm.input({ ...options })",
            "dtm.input({ required: maybe })",
            "dtm.param(1, { min: 3, max: 2 })",
            "dtm.param(1, 0, ten)",
            "dtm.param(false, { min: 0 })",
            'dtm.param("x", { id: "" })',
        ]
        for (const expression of cases) {
            const result = analyze(`createImageProcess(async (dtm) => ${expression})`)
            expect(result.diagnostics, expression).toEqual(
                expect.arrayContaining([expect.objectContaining({ code: "unsupported-call" })]),
            )
            expect(result.instrumentedSource).toBeUndefined()
        }
    })

    it("rejects non-finite numeric defaults and every numeric constraint", () => {
        const cases = [
            "dtm.param(1e999)",
            "dtm.param(-1e999)",
            "dtm.param(1, { min: 1e999 })",
            "dtm.param(1, { max: -1e999 })",
            "dtm.param(1, { step: 1e999 })",
            "dtm.param(1, 0, 1e999, 1)",
            "dtm.param(1, -1e999, 10, 1)",
            "dtm.param(1, 0, 10, 1e999)",
        ]
        for (const expression of cases) {
            const source = `createImageProcess(async (dtm) => ${expression})`
            const result = analyze(source)
            const diagnostic = result.diagnostics.find((entry) => entry.code === "unsupported-call")
            expect(diagnostic, expression).toBeDefined()
            expect(diagnostic?.location?.range.start.offset, expression).toBe(
                source.indexOf("dtm.param"),
            )
            expect(result.controls, expression).toEqual([])
            expect(result.instrumentedSource, expression).toBeUndefined()
        }
    })

    it("instruments calls without changing surrounding source behavior", () => {
        const source = `createImageProcess(async (dtm) => {
 const amount = dtm.param(2)
 return await dtm.input({ id: "photo" })
})`
        const result = analyze(source)
        expect(result.instrumentedSource).toContain(`dtm.__param("${result.controls[0].id}", 2)`)
        expect(result.instrumentedSource).toContain('dtm.__input("photo", { id: "photo" })')
        expect(
            result.instrumentedSource
                ?.replace(/__param\("[^"]+", /, "param(")
                .replace('__input("photo", ', "input("),
        ).toBe(source)
    })

    it("preserves observable behavior and side-effect order when executed in Node", async () => {
        const source = `createImageProcess(async (dtm) => {
 const amount = dtm.param(2, { id: "amount" })
 const image = await dtm.input({ id: "photo" })
 const enabled = dtm.param(true, { id: "enabled" })
 return { amount, image: image.path, enabled }
})`
        const analysis = analyze(source)
        const original = await executeFixture(source, false)
        const instrumented = await executeFixture(requireValue(analysis.instrumentedSource), true)
        expect(instrumented).toEqual(original)
        expect(instrumented.log).toEqual(["param:2", "input:photo", "param:true"])
    })

    it("emits source mappings back to original runtime locations", () => {
        const source = `createImageProcess(async (dtm) => {
 const amount = dtm.param(2)
})`
        const result = analyze(source)
        const instrumentedSource = requireValue(result.instrumentedSource)
        const map = JSON.parse(requireValue(result.sourceMap)) as SourceMap
        expect(map).toMatchObject({ version: 3, sources: ["process.ts"], sourcesContent: [source] })
        const generatedOffset = instrumentedSource.indexOf("2)")
        const generatedPosition = offsetPosition(instrumentedSource, generatedOffset)
        const mapped = decodeMapping(map.mappings, generatedPosition.line, generatedPosition.column)
        const originalOffset = source.indexOf("2)")
        expect(mapped).toEqual(offsetPosition(source, originalOffset))
    })

    it("uses Monaco and TypeScript-compatible UTF-16 offsets", () => {
        const source = `createImageProcess(async (dtm) => {\n const emoji = "😀"; const size = dtm.param(1)\n})`
        const result = analyze(source)
        const start = source.indexOf("dtm.param")
        const expected = offsetPosition(source, start)
        expect(result.controls[0].sourceRange.start).toEqual({
            line: expected.line + 1,
            column: expected.column + 1,
            offset: start,
        })
        expect(source.slice(start, result.controls[0].sourceRange.end.offset)).toBe("dtm.param(1)")

        const instrumentedSource = requireValue(result.instrumentedSource)
        const generatedOffset = instrumentedSource.indexOf("1)")
        const generated = offsetPosition(instrumentedSource, generatedOffset)
        expect(
            decodeMapping(
                JSON.parse(requireValue(result.sourceMap)).mappings,
                generated.line,
                generated.column,
            ),
        ).toEqual(offsetPosition(source, source.indexOf("1)")))
    })

    it.each([
        ["standalone CR", "\r"],
        ["CRLF", "\r\n"],
    ])("maps runtime positions across %s line endings", (_name, newline) => {
        const source = `createImageProcess(async (dtm) => {${newline} const size = dtm.param(1)${newline}})`
        const result = analyze(source)
        const instrumented = requireValue(result.instrumentedSource)
        const generatedOffset = instrumented.indexOf("1)")
        const generatedPosition = offsetPosition(instrumented, generatedOffset)
        const mapped = decodeMapping(
            JSON.parse(requireValue(result.sourceMap)).mappings,
            generatedPosition.line,
            generatedPosition.column,
        )
        expect(mapped).toEqual(offsetPosition(source, source.indexOf("1)")))
        expect(result.controls[0].sourceRange.start.line).toBe(2)
    })
})

async function executeFixture(source: string, instrumented: boolean) {
    let callback: ((dtm: Record<string, unknown>) => Promise<unknown>) | undefined
    runInNewContext(source, {
        createImageProcess(value: typeof callback) {
            callback = value
        },
    })
    const log: string[] = []
    const param = (value: unknown) => {
        log.push(`param:${String(value)}`)
        return value
    }
    const input = async (options: { id: string }) => {
        log.push(`input:${options.id}`)
        return { path: "/fixture.png", mediaType: "image/png" }
    }
    const dtm = instrumented
        ? {
              __param: (_id: string, value: unknown) => param(value),
              __input: (_id: string, options: { id: string }) => input(options),
          }
        : { param, input }
    const result = await requireValue(callback)(dtm)
    return { result: structuredClone(result), log }
}

interface SourceMap {
    version: number
    sources: string[]
    sourcesContent: string[]
    mappings: string
}

function offsetPosition(source: string, offset: number): { line: number; column: number } {
    let line = 0
    let column = 0
    for (let index = 0; index < offset; index += 1) {
        const standaloneCarriageReturn = source[index] === "\r" && source[index + 1] !== "\n"
        if (source[index] === "\n" || standaloneCarriageReturn) {
            line += 1
            column = 0
        } else {
            column += 1
        }
    }
    return { line, column }
}

function requireValue<T>(value: T | undefined): T {
    if (value === undefined) throw new Error("expected value")
    return value
}

function decodeMapping(mappings: string, wantedLine: number, wantedColumn: number) {
    let sourceLine = 0
    let sourceColumn = 0
    const lines = mappings.split(";")
    for (let line = 0; line <= wantedLine; line += 1) {
        let generatedColumn = 0
        for (const segment of lines[line].split(",")) {
            if (!segment) continue
            const values = decodeVlq(segment)
            generatedColumn += values[0]
            sourceLine += values[2]
            sourceColumn += values[3]
            if (line === wantedLine && generatedColumn === wantedColumn) {
                return { line: sourceLine, column: sourceColumn }
            }
        }
    }
    throw new Error("mapping not found")
}

function decodeVlq(segment: string): number[] {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    const values: number[] = []
    let value = 0
    let shift = 0
    for (const character of segment) {
        const digit = alphabet.indexOf(character)
        value |= (digit & 31) << shift
        if (digit & 32) {
            shift += 5
        } else {
            values.push(value & 1 ? -(value >> 1) : value >> 1)
            value = 0
            shift = 0
        }
    }
    return values
}
