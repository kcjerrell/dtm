import type { ProjectId, RunIdentity, RunRequest, ScriptRunEvent } from "../contracts"

export interface RunCommands {
    trust(projectId: ProjectId): Promise<void>
    run(request: RunRequest): Promise<RunIdentity>
    /** S20 cancellation is global. The workspace must have one run owner. */
    stop(): Promise<void>
}

export interface RunEventSource {
    subscribe(listener: (event: ScriptRunEvent) => void): Promise<() => void>
}

/** Importing these adapters never starts IPC or subscribes to events. */
export function createRunCommands(
    invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>,
): RunCommands {
    return {
        trust: (projectId) => invoke("trust_script_project", { projectId }),
        run: (request) => invoke("run_script", { request }),
        stop: () => invoke("cancel_script"),
    }
}

/** S40/S41 choose the application event name; it is not part of the frozen wire contract. */
export function createRunEventSource(
    listen: <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>,
    eventName: string,
): RunEventSource {
    return {
        subscribe: (listener) =>
            listen<ScriptRunEvent>(eventName, ({ payload }) => listener(payload)),
    }
}
