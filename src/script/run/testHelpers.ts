import { vi } from "vitest"
import type {
    ClientRequestId,
    InputRevision,
    OutputMetadata,
    ProjectId,
    RunId,
    RunIdentity,
    RunRequest,
    ScriptDiagnostic,
    ScriptRunEvent,
    SourceRevision,
    ValueRevision,
} from "../contracts"
import { ScriptRunController } from "./controller"

export function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((yes, no) => {
        resolve = yes
        reject = no
    })
    return { promise, resolve, reject }
}
export function request(id = "request-1", revision = 1): RunRequest {
    return {
        projectId: "project-a" as ProjectId,
        clientRequestId: id as ClientRequestId,
        source: {
            sourceRevision: revision as SourceRevision,
            contentHash: "",
            source: "original source",
            instrumentedSource: "instrumented source",
        },
        valueRevision: 0 as ValueRevision,
        inputRevision: 0 as InputRevision,
        values: { strength: { type: "number", value: 2 } },
        inputs: [],
    }
}
export function identity(snapshot = request(), runId = "run-1"): RunIdentity {
    return {
        projectId: snapshot.projectId,
        clientRequestId: snapshot.clientRequestId,
        runId: runId as RunId,
        sourceRevision: snapshot.source.sourceRevision,
        valueRevision: snapshot.valueRevision,
        inputRevision: snapshot.inputRevision,
    }
}
export const output: OutputMetadata = {
    previewUrl: `dtm://script-output/${"a".repeat(64)}`,
    mediaType: "image/png",
    byteLength: 20,
    width: 1,
    height: 1,
}
export const failure: ScriptDiagnostic = {
    source: "userRuntime",
    severity: "error",
    message: "Failed to open /Users/person/private/image.png",
}

export function harness() {
    let listener: ((event: ScriptRunEvent) => void) | undefined
    const unsubscribe = vi.fn()
    const commands = {
        trust: vi.fn(async () => {}),
        run: vi.fn(async (snapshot: RunRequest) => identity(snapshot)),
        stop: vi.fn(async () => {}),
    }
    const events = {
        subscribe: vi.fn(async (next: (event: ScriptRunEvent) => void): Promise<() => void> => {
            listener = next
            return unsubscribe
        }),
    }
    const controller = new ScriptRunController({ projectId: request().projectId, commands, events })
    return {
        controller,
        commands,
        events,
        unsubscribe,
        emit: (event: ScriptRunEvent) => listener?.(event),
    }
}
