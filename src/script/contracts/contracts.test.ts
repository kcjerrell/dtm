import { describe, expect, it } from "vitest"
import type { ContractFixtures, GeneratedControl, ScriptRunEvent } from "."
import fixtureJson from "./fixtures/contracts.json"

const fixtures = fixtureJson satisfies ContractFixtures

describe("image script contracts", () => {
    it("statically checks and preserves the shared JSON fixture", () => {
        expect(JSON.parse(JSON.stringify(fixtures))).toEqual(fixtureJson)
    })

    it("covers every control and event tag", () => {
        const controlTags: GeneratedControl["type"][] = [
            "image",
            "number",
            "slider",
            "boolean",
            "text",
        ]
        const eventTags: ScriptRunEvent["type"][] = [
            "queued",
            "started",
            "log",
            "diagnostic",
            "succeeded",
            "failed",
            "cancelled",
        ]
        expect(new Set(fixtures.controls.map(({ type }) => type))).toEqual(new Set(controlTags))
        expect(new Set(fixtures.events.map(({ type }) => type))).toEqual(new Set(eventTags))
    })

    it("keeps opaque output URLs free of host paths", () => {
        for (const output of fixtures.outputs) {
            expect(output.previewUrl).toMatch(/^dtm:\/\/script-output\/[^/]+$/)
            expect(output).not.toHaveProperty("path")
        }
    })
})
