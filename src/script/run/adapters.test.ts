import { expect, it, vi } from "vitest"
import type { ScriptRunEvent } from "../contracts"
import { createRunCommands, createRunEventSource } from "./adapters"
import { identity, request } from "./testHelpers"

it("maps typed commands to the existing S20 command surface without eager IPC", async () => {
    const invoke = vi.fn(async (_command: string, _args?: Record<string, unknown>) => identity())
    const commands = createRunCommands(
        <T>(command: string, args?: Record<string, unknown>) => invoke(command, args) as Promise<T>,
    )
    expect(invoke).not.toHaveBeenCalled()
    await commands.trust(request().projectId)
    expect(invoke).toHaveBeenLastCalledWith("trust_script_project", {
        projectId: request().projectId,
    })
    await commands.run(request())
    expect(invoke).toHaveBeenLastCalledWith("run_script", { request: request() })
    await commands.stop()
    expect(invoke).toHaveBeenLastCalledWith("cancel_script", undefined)
})

it("unwraps typed event payloads using the integration-owned event name", async () => {
    let handler: ((event: { payload: ScriptRunEvent }) => void) | undefined
    const unlisten = vi.fn()
    const calls = vi.fn()
    const listen = async <T>(eventName: string, next: (event: { payload: T }) => void) => {
        calls(eventName)
        handler = next as (event: { payload: ScriptRunEvent }) => void
        return unlisten
    }
    const source = createRunEventSource(listen, "chosen-script-event")
    expect(calls).not.toHaveBeenCalled()
    const listener = vi.fn()
    const dispose = await source.subscribe(listener)
    const event: ScriptRunEvent = { type: "queued", identity: identity() }
    handler?.({ payload: event })
    expect(calls).toHaveBeenCalledWith("chosen-script-event")
    expect(listener).toHaveBeenCalledWith(event)
    dispose()
    expect(unlisten).toHaveBeenCalledTimes(1)
})
