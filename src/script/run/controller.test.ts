import { snapshot } from "valtio/vanilla"
import { expect, it } from "vitest"
import type {
    ClientRequestId,
    ControlValue,
    InputRevision,
    ProjectId,
    RunId,
    RunIdentity,
    SourceRevision,
    ValueRevision,
} from "../contracts"
import { redactLocalPaths } from "./presentation"
import { deferred, failure, harness, identity, output, request } from "./testHelpers"

it("requires explicit trust and does not execute on construction, connect or trust", async () => {
    const h = harness()
    expect(h.events.subscribe).not.toHaveBeenCalled()
    expect(await h.controller.run(request())).toBe(false)
    expect(await h.controller.trust(false)).toBe(false)
    expect(h.commands.trust).not.toHaveBeenCalled()
    await h.controller.connect()
    expect(h.commands.run).not.toHaveBeenCalled()
    expect(await h.controller.trust(true)).toBe(true)
    expect(h.commands.run).not.toHaveBeenCalled()
    expect(await h.controller.run(request())).toBe(true)
    expect(h.commands.run).toHaveBeenCalledTimes(1)
    h.controller.dispose()
})

it("subscribes before IPC and keeps terminal events that precede the run acknowledgement", async () => {
    const h = harness()
    h.commands.run.mockImplementation(async (next) => {
        expect(h.events.subscribe).toHaveBeenCalledTimes(1)
        const id = identity(next)
        h.emit({ type: "queued", identity: id })
        h.emit({ type: "started", identity: id, startedAt: "now" })
        h.emit({ type: "succeeded", identity: id, output })
        return id
    })
    await h.controller.trust(true)
    expect(await h.controller.run(request())).toBe(true)
    expect(h.controller.state.phase).toBe("succeeded")
    expect(h.controller.state.active).toBe(false)
    expect(h.controller.state.preview?.output).toEqual(output)
    h.controller.dispose()
})

it("preserves last-good output across failure and marks independent desired revisions", async () => {
    const h = harness()
    await h.controller.trust(true)
    await h.controller.run(request())
    h.emit({ type: "succeeded", identity: identity(), output })
    const preview = snapshot(h.controller.state).preview
    const next = request("request-2", 2)
    h.controller.setDesiredRevisions({
        sourceRevision: next.source.sourceRevision,
        valueRevision: next.valueRevision,
        inputRevision: next.inputRevision,
    })
    await h.controller.run(next)
    h.emit({ type: "diagnostic", identity: identity(next), diagnostic: failure })
    h.emit({ type: "failed", identity: identity(next), diagnostic: failure })
    expect(h.controller.state.preview).toEqual(preview)
    expect(h.controller.state.runtimeProblems).toHaveLength(1)
    expect(h.controller.state.runtimeProblems[0].message).toBe("Failed to open [local path]")
    expect(h.controller.state.desired?.sourceRevision).toBe(2)
    h.controller.dispose()
})

it("ignores other projects, requests, backend run IDs and each mismatched revision", async () => {
    const h = harness()
    await h.controller.trust(true)
    await h.controller.run(request())
    const expected = snapshot(h.controller.state)
    const mismatches: Partial<RunIdentity>[] = [
        { projectId: "other" as ProjectId },
        { clientRequestId: "other" as ClientRequestId },
        { runId: "other" as RunId },
        { sourceRevision: 2 as SourceRevision },
        { valueRevision: 2 as ValueRevision },
        { inputRevision: 2 as InputRevision },
    ]
    for (const mismatch of mismatches) {
        h.emit({ type: "succeeded", identity: { ...identity(), ...mismatch }, output })
        h.emit({
            type: "log",
            identity: { ...identity(), ...mismatch },
            stream: "stdout",
            message: "obsolete",
        })
        expect(snapshot(h.controller.state)).toEqual(expected)
    }
    h.controller.dispose()
})

it("rejects obsolete results after desired edits but retires the active lifecycle", async () => {
    const h = harness()
    await h.controller.trust(true)
    await h.controller.run(request())
    h.controller.setDesiredRevisions({ ...identity(), valueRevision: 5 as ValueRevision })
    h.emit({ type: "log", identity: identity(), stream: "stdout", message: "old" })
    h.emit({ type: "succeeded", identity: identity(), output })
    expect(h.controller.state.preview).toBeNull()
    expect(h.controller.state.logs).toHaveLength(0)
    expect(h.controller.state.active).toBe(false)
    h.controller.dispose()
})

it("retains Stop for an existing process when replacement preparation fails", async () => {
    const h = harness()
    await h.controller.trust(true)
    await h.controller.run(request())
    h.emit({ type: "started", identity: identity(), startedAt: "now" })
    const next = request("request-2")
    const nextIdentity = identity(next, "run-2")
    h.commands.run.mockImplementationOnce(async () => {
        h.emit({ type: "queued", identity: nextIdentity })
        h.emit({ type: "failed", identity: nextIdentity, diagnostic: failure })
        throw new Error("preparation failed")
    })
    expect(await h.controller.run(next)).toBe(false)
    expect(h.controller.state.phase).toBe("failed")
    expect(h.controller.state.active).toBe(true)
    h.emit({ type: "log", identity: identity(), stream: "stdout", message: "old output" })
    expect(h.controller.state.logs).toHaveLength(0)
    expect(await h.controller.stop()).toBe(true)
    expect(h.commands.stop).toHaveBeenCalledTimes(1)
    h.emit({ type: "cancelled", identity: identity(), reason: "user" })
    expect(h.controller.state.active).toBe(false)
    expect(h.controller.state.stopping).toBe(false)
    expect(h.controller.state.phase).toBe("failed")
    h.controller.dispose()
})

it("handles delayed preparation failure events after the invoke rejection", async () => {
    const h = harness()
    await h.controller.trust(true)
    h.commands.run.mockRejectedValueOnce(new Error("/private/backend/error"))
    await h.controller.run(request())
    expect(h.controller.state.error).not.toContain("/private")
    h.emit({ type: "queued", identity: identity() })
    h.emit({ type: "failed", identity: identity(), diagnostic: failure })
    expect(h.controller.state.runtimeProblems).toHaveLength(1)
    expect(h.controller.state.active).toBe(false)
    expect(h.controller.state.phase).toBe("failed")
    h.controller.dispose()
})

it("enables Stop only for an admitted active run and waits for terminal cancellation", async () => {
    const h = harness()
    expect(await h.controller.stop()).toBe(false)
    await h.controller.trust(true)
    await h.controller.run(request())
    expect(await h.controller.stop()).toBe(true)
    expect(h.controller.state.stopping).toBe(true)
    expect(await h.controller.stop()).toBe(false)
    expect(await h.controller.run(request("replacement"))).toBe(false)
    h.emit({ type: "cancelled", identity: identity(), reason: "user" })
    h.emit({ type: "succeeded", identity: identity(), output })
    expect(h.controller.state.phase).toBe("cancelled")
    expect(h.controller.state.preview).toBeNull()
    expect(await h.controller.stop()).toBe(false)
    h.controller.dispose()
})

it("ignores a late Stop rejection after the run is already terminal", async () => {
    const h = harness()
    await h.controller.trust(true)
    await h.controller.run(request())
    const gate = deferred<void>()
    h.commands.stop.mockReturnValueOnce(gate.promise)
    const stopping = h.controller.stop()
    h.emit({ type: "cancelled", identity: identity(), reason: "user" })
    gate.reject(new Error("late cancellation error"))
    await stopping
    expect(h.controller.state.error).toBeNull()
    expect(h.controller.state.phase).toBe("cancelled")
    h.controller.dispose()
})

it.each([
    "at [/private/tmp/process.ts:5:8]",
    "could not open </Users/person/private.png>",
    "error:/Users/person/private.png",
    '{path:"/Users/person/private.png"}',
])("redacts native paths with routine punctuation: %s", (message) => {
    expect(redactLocalPaths(message)).not.toMatch(/\/Users|\/private/)
    expect(redactLocalPaths(message)).toContain("[local path]")
})

it("redacts UNC paths", () => {
    expect(redactLocalPaths("at \\\\server\\share\\private.png")).toBe("at [local path]")
})

it("keeps admission pending while queued events precede a slow command acknowledgement", async () => {
    const h = harness()
    await h.controller.trust(true)
    const gate = deferred<RunIdentity>()
    const entered = deferred<void>()
    h.commands.run.mockImplementationOnce(async () => {
        h.emit({ type: "queued", identity: identity() })
        entered.resolve()
        return gate.promise
    })
    const running = h.controller.run(request())
    await entered.promise
    expect(h.controller.state.admitting).toBe(true)
    expect(h.controller.state.active).toBe(true)
    expect(await h.controller.run(request("request-2"))).toBe(false)
    gate.resolve(identity())
    await running
    expect(h.controller.state.admitting).toBe(false)
    h.controller.dispose()
})

it("bounds and sanitizes logs independently of problems", async () => {
    const h = harness()
    await h.controller.trust(true)
    await h.controller.run(request())
    h.emit({
        type: "log",
        identity: identity(),
        stream: "stderr",
        message: "at C:\\Users\\person\\secret.png and /private/tmp/secret.png\n",
    })
    h.emit({ type: "log", identity: identity(), stream: "stdout", message: "x".repeat(100_000) })
    h.emit({ type: "diagnostic", identity: identity(), diagnostic: failure })
    expect(h.controller.state.logs.map((entry) => entry.message).join("")).not.toMatch(
        /Users|private/,
    )
    expect(h.controller.state.logs.reduce((sum, entry) => sum + entry.message.length, 0)).toBe(
        65_536,
    )
    expect(h.controller.state.logsTruncated).toBe(true)
    expect(h.controller.state.runtimeProblems).toHaveLength(1)
    h.controller.dispose()
})

it("caps short log entries and diagnostics", async () => {
    const h = harness()
    await h.controller.trust(true)
    await h.controller.run(request())
    for (let index = 0; index < 600; ++index) {
        h.emit({ type: "log", identity: identity(), stream: "stdout", message: "x" })
        h.emit({
            type: "diagnostic",
            identity: identity(),
            diagnostic: { ...failure, message: `error ${index}` },
        })
    }
    expect(h.controller.state.logs).toHaveLength(500)
    expect(h.controller.state.runtimeProblems).toHaveLength(100)
    expect(h.controller.state.logsTruncated).toBe(true)
    h.controller.dispose()
})

it("freezes snapshots before async subscription setup", async () => {
    const h = harness()
    const gate = deferred<() => void>()
    h.events.subscribe.mockReturnValueOnce(gate.promise)
    await h.controller.trust(true)
    const next = request()
    const running = h.controller.run(next)
    next.source.source = "mutated"
    ;(next.values as Record<string, ControlValue>).strength = { type: "number", value: 100 }
    gate.resolve(h.unsubscribe)
    await running
    expect(h.commands.run.mock.calls[0][0].source.source).toBe("original source")
    expect(h.commands.run.mock.calls[0][0].values.strength.value).toBe(2)
    h.controller.dispose()
})

it("disposal during subscription releases its late handle without executing", async () => {
    const h = harness()
    const gate = deferred<() => void>()
    h.events.subscribe.mockReturnValueOnce(gate.promise)
    await h.controller.trust(true)
    const running = h.controller.run(request())
    h.controller.dispose()
    gate.resolve(h.unsubscribe)
    expect(await running).toBe(false)
    expect(h.unsubscribe).toHaveBeenCalledTimes(1)
    expect(h.commands.run).not.toHaveBeenCalled()
    expect(h.commands.stop).not.toHaveBeenCalled()
})

it("trust invalidation ignores a late trust acknowledgement and pending run", async () => {
    const h = harness()
    const gate = deferred<void>()
    h.commands.trust.mockReturnValueOnce(gate.promise)
    const trusting = h.controller.trust(true)
    h.controller.invalidateTrust()
    gate.resolve()
    expect(await trusting).toBe(false)
    expect(await h.controller.run(request())).toBe(false)
    expect(h.controller.state.trust).toBe("untrusted")
    h.controller.dispose()
})

it("fails closed on a mismatched acknowledgement", async () => {
    const h = harness()
    await h.controller.trust(true)
    h.commands.run.mockResolvedValueOnce({ ...identity(), sourceRevision: 20 as SourceRevision })
    expect(await h.controller.run(request())).toBe(false)
    expect(h.controller.state.phase).toBe("failed")
    expect(h.controller.state.preview).toBeNull()
    h.controller.dispose()
})

it.each([
    "file:///Users/person/private.png",
    "https://example.com/image.png",
    "dtm://script-output/bad",
    `${output.previewUrl}?path=secret`,
])("rejects nonopaque preview %s without erasing the last output", async (previewUrl) => {
    const h = harness()
    await h.controller.trust(true)
    await h.controller.run(request())
    h.emit({ type: "succeeded", identity: identity(), output })
    await h.controller.run(request("request-2"))
    h.emit({
        type: "succeeded",
        identity: identity(request("request-2")),
        output: { ...output, previewUrl },
    })
    expect(h.controller.state.preview?.output.previewUrl).toBe(output.previewUrl)
    expect(h.controller.state.phase).toBe("failed")
    expect(h.controller.state.runtimeProblems[0].source).toBe("outputValidation")
    h.controller.dispose()
})

it("reports trust and stop errors without native details", async () => {
    const h = harness()
    h.commands.trust.mockRejectedValueOnce(new Error("/Users/person/private"))
    expect(await h.controller.trust(true)).toBe(false)
    expect(h.controller.state.error).not.toContain("/Users")
    await h.controller.trust(true)
    await h.controller.run(request())
    h.commands.stop.mockRejectedValueOnce(new Error("/private/error"))
    expect(await h.controller.stop()).toBe(false)
    expect(h.controller.state.stopping).toBe(false)
    expect(h.controller.state.error).not.toContain("/private")
    h.controller.dispose()
})

it("does not render raw runtime locations as editor locations", () => {
    const h = harness()
    h.controller.setEditorProblems([{ ...failure, source: "analyzer" }])
    expect(h.controller.state.editorProblems[0].source).toBe("analyzer")
    expect(h.controller.state.editorProblems[0].message).not.toContain("/Users")
    h.controller.dispose()
})
