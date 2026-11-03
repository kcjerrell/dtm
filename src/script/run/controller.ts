import { proxy } from "valtio/vanilla"
import type {
    InputRevision,
    OutputMetadata,
    ProjectId,
    RunIdentity,
    RunRequest,
    ScriptDiagnostic,
    ScriptRunEvent,
    SourceRevision,
    ValueRevision,
} from "../contracts"
import { safePreview } from "../preview/output"
import type { RunCommands, RunEventSource } from "./adapters"
import { presentDiagnostic, redactLocalPaths } from "./presentation"

export interface RunRevisions {
    sourceRevision: SourceRevision
    valueRevision: ValueRevision
    inputRevision: InputRevision
}
export type RunPhase =
    | "idle"
    | "submitting"
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "cancelled"
export interface RunState {
    projectId: ProjectId
    trust: "untrusted" | "pending" | "trusted"
    phase: RunPhase
    identity: RunIdentity | null
    active: boolean
    admitting: boolean
    stopping: boolean
    error: string | null
    desired: RunRevisions | null
    editorProblems: ScriptDiagnostic[]
    runtimeProblems: ScriptDiagnostic[]
    logs: { stream: "stdout" | "stderr"; message: string }[]
    logsTruncated: boolean
    preview: { identity: RunIdentity; output: OutputMetadata } | null
}

export function sameRevisions(a: RunRevisions, b: RunRevisions): boolean {
    return (
        a.sourceRevision === b.sourceRevision &&
        a.valueRevision === b.valueRevision &&
        a.inputRevision === b.inputRevision
    )
}

/** One project lifetime. Source, request handles and subscriptions stay outside
 * Valtio. The host supplies already-analyzed snapshots and owns scheduling. */
export class ScriptRunController {
    readonly state: RunState
    readonly #commands: RunCommands
    readonly #events: RunEventSource
    #unsubscribe: (() => void) | undefined
    #connecting: Promise<void> | undefined
    #request:
        | (Pick<RunRequest, "projectId" | "clientRequestId" | "valueRevision" | "inputRevision"> & {
              sourceRevision: SourceRevision
          })
        | undefined
    #submission = 0
    #trustGeneration = 0
    #disposed = false
    #logLength = 0
    #settled = false
    readonly #liveRuns = new Map<string, RunIdentity>()
    readonly #usedRequests = new Set<string>()

    constructor(options: { projectId: ProjectId; commands: RunCommands; events: RunEventSource }) {
        this.#commands = options.commands
        this.#events = options.events
        this.state = proxy<RunState>({
            projectId: options.projectId,
            trust: "untrusted",
            phase: "idle",
            identity: null,
            active: false,
            admitting: false,
            stopping: false,
            error: null,
            desired: null,
            editorProblems: [],
            runtimeProblems: [],
            logs: [],
            logsTruncated: false,
            preview: null,
        })
    }

    /** Subscription is established before any run command, including an immediate
     * queued event. Dispose during connection releases the eventual subscription. */
    connect(): Promise<void> {
        if (this.#disposed) return Promise.reject(new Error("Run controller is disposed"))
        if (this.#unsubscribe) return Promise.resolve()
        if (!this.#connecting) {
            this.#connecting = this.#events
                .subscribe((event) => this.acceptEvent(event))
                .then((unsubscribe) => {
                    if (this.#disposed) unsubscribe()
                    else this.#unsubscribe = unsubscribe
                })
                .finally(() => {
                    this.#connecting = undefined
                })
        }
        return this.#connecting
    }

    setDesiredRevisions(revisions: RunRevisions): void {
        if (!this.#disposed) this.state.desired = { ...revisions }
    }

    setEditorProblems(diagnostics: readonly ScriptDiagnostic[]): void {
        if (!this.#disposed)
            this.state.editorProblems = diagnostics.slice(0, 100).map(presentDiagnostic)
    }

    /** Call on reopen/external modification. Backend source-hash trust is authoritative. */
    invalidateTrust(): void {
        ++this.#trustGeneration
        if (!this.#disposed) this.state.trust = "untrusted"
    }

    /** The explicit argument represents the user's acknowledgement of the warning. */
    async trust(acknowledged: boolean): Promise<boolean> {
        if (this.#disposed || !acknowledged || this.state.trust === "pending") return false
        const generation = ++this.#trustGeneration
        this.state.trust = "pending"
        this.state.error = null
        try {
            await this.#commands.trust(this.state.projectId)
            if (this.#disposed || generation !== this.#trustGeneration) return false
            this.state.trust = "trusted"
            return true
        } catch {
            if (!this.#disposed && generation === this.#trustGeneration) {
                this.state.trust = "untrusted"
                this.state.error = "Could not trust this script. Save it and try again."
            }
            return false
        }
    }

    async run(request: RunRequest): Promise<boolean> {
        if (
            this.#disposed ||
            this.state.trust !== "trusted" ||
            this.state.admitting ||
            this.state.stopping ||
            request.projectId !== this.state.projectId ||
            this.#usedRequests.has(request.clientRequestId)
        )
            return false
        const revisions = {
            sourceRevision: request.source.sourceRevision,
            valueRevision: request.valueRevision,
            inputRevision: request.inputRevision,
        }
        if (this.state.desired && !sameRevisions(revisions, this.state.desired)) return false
        // The host generates globally unique request IDs. Keep a bounded replay
        // guard rather than retaining every live-edit request for the session.
        if (this.#usedRequests.size >= 1024) {
            const oldest = this.#usedRequests.values().next().value
            if (oldest !== undefined) this.#usedRequests.delete(oldest)
        }
        this.#usedRequests.add(request.clientRequestId)
        const generation = ++this.#submission
        const trustGeneration = this.#trustGeneration
        this.state.admitting = true
        try {
            // Freeze before subscription setup can yield to edits in the host.
            const frozen = structuredClone(request)
            await this.connect()
            if (
                this.#disposed ||
                generation !== this.#submission ||
                trustGeneration !== this.#trustGeneration ||
                this.state.trust !== "trusted" ||
                (this.state.desired && !sameRevisions(revisions, this.state.desired))
            )
                return false
            this.#request = {
                projectId: frozen.projectId,
                clientRequestId: frozen.clientRequestId,
                ...revisions,
            }
            this.state.desired = { ...revisions }
            this.state.identity = null
            this.#settled = false
            this.state.phase = "submitting"
            this.state.active = this.#liveRuns.size > 0
            this.state.error = null
            this.state.logs = []
            this.#logLength = 0
            this.state.logsTruncated = false
            this.state.runtimeProblems = []
            const identity = await this.#commands.run(frozen)
            if (this.#disposed || generation !== this.#submission) return false
            return this.#acknowledge(identity)
        } catch {
            if (
                !this.#disposed &&
                generation === this.#submission &&
                !["succeeded", "failed", "cancelled"].includes(this.state.phase)
            )
                this.#failAdmission(
                    "The run could not be started. Check trust, save the project, and try again.",
                )
            return false
        } finally {
            if (generation === this.#submission) this.state.admitting = false
        }
    }

    /** Typed transport boundary. Unrelated projects, requests, backend IDs and
     * revisions cannot update state, even if they have the same revision number. */
    acceptEvent(event: ScriptRunEvent): boolean {
        if (this.#disposed) return false
        const terminal =
            event.type === "succeeded" || event.type === "failed" || event.type === "cancelled"
        const tracked = this.#liveRuns.get(event.identity.runId)
        const trackedIdentity =
            tracked &&
            tracked.projectId === event.identity.projectId &&
            tracked.clientRequestId === event.identity.clientRequestId &&
            sameRevisions(tracked, event.identity)
        // A failed replacement can leave the previous process alive. Retire its
        // lifecycle independently, without accepting its obsolete logs/output.
        if (terminal && trackedIdentity) {
            this.#liveRuns.delete(event.identity.runId)
            this.state.active = this.#liveRuns.size > 0
            if (!this.state.active) this.state.stopping = false
        }
        if (!this.#matches(event.identity)) return Boolean(terminal && trackedIdentity)
        const current = this.state.identity
        if (current && current.runId !== event.identity.runId) return false
        if (this.#settled) return false
        if (!current) this.state.identity = { ...event.identity }
        if (event.type === "queued" || event.type === "started") {
            this.#liveRuns.set(event.identity.runId, { ...event.identity })
            this.state.active = true
        }
        const desired = this.state.desired
        const stale = Boolean(desired && !sameRevisions(event.identity, desired))
        // A stale active run still needs its terminal lifecycle retired so Stop
        // cannot target a completed process. It can never publish obsolete content.
        if (stale && !terminal) return false
        if (terminal) {
            this.#settled = true
            this.state.active = this.#liveRuns.size > 0
            if (!this.state.active) this.state.stopping = false
            this.state.phase = event.type
            this.state.error = null
            if (stale) return true
        }
        switch (event.type) {
            case "queued":
                if (this.state.phase !== "running") this.state.phase = "queued"
                this.state.active = true
                break
            case "started":
                this.state.phase = "running"
                this.state.active = true
                break
            case "log":
                this.#appendLog(event.stream, event.message)
                break
            case "diagnostic":
                this.#problem(event.diagnostic)
                break
            case "succeeded": {
                const output = safePreview(event.output)
                if (output) this.state.preview = { identity: { ...event.identity }, output }
                else {
                    this.state.phase = "failed"
                    this.#problem({
                        source: "outputValidation",
                        severity: "error",
                        message: "The output preview URL or metadata is invalid.",
                    })
                }
                break
            }
            case "failed":
                this.#problem(event.diagnostic)
                break
            case "cancelled":
                break
        }
        return true
    }

    async stop(): Promise<boolean> {
        if (this.#disposed || !this.state.active || this.state.stopping) return false
        const generation = this.#submission
        this.state.stopping = true
        this.state.error = null
        try {
            await this.#commands.stop()
            return !this.#disposed && generation === this.#submission
        } catch {
            if (
                !this.#disposed &&
                generation === this.#submission &&
                this.state.active &&
                this.state.stopping
            ) {
                this.state.stopping = false
                this.state.error = "Could not stop the script. Try again."
            }
            return false
        }
        // Stay stopping until a terminal event, not merely the cancellation ack.
    }

    #matches(identity: RunIdentity): boolean {
        const request = this.#request
        return Boolean(
            request &&
                identity.projectId === request.projectId &&
                identity.clientRequestId === request.clientRequestId &&
                sameRevisions(identity, request),
        )
    }

    #acknowledge(identity: RunIdentity): boolean {
        if (
            !this.#matches(identity) ||
            (this.state.identity && this.state.identity.runId !== identity.runId)
        ) {
            this.#failAdmission("Run acknowledgement did not match the submitted snapshot.")
            return false
        }
        // The event stream may already have delivered started or terminal.
        if (!this.state.identity) {
            this.state.identity = { ...identity }
            this.state.phase = "queued"
            this.#liveRuns.set(identity.runId, { ...identity })
            this.state.active = true
        }
        return true
    }

    #failAdmission(message: string): void {
        this.state.phase = "failed"
        this.state.active = this.#liveRuns.size > 0
        if (!this.state.active) this.state.stopping = false
        this.state.error = message
    }

    #problem(diagnostic: ScriptDiagnostic): void {
        const item = presentDiagnostic(diagnostic)
        if (
            this.state.runtimeProblems.some(
                (existing) =>
                    existing.source === item.source &&
                    existing.severity === item.severity &&
                    existing.message === item.message &&
                    existing.code === item.code,
            )
        )
            return
        if (this.state.runtimeProblems.length < 100) this.state.runtimeProblems.push(item)
    }

    #appendLog(stream: "stdout" | "stderr", message: string): void {
        const remaining = 64 * 1024 - this.#logLength
        if (remaining <= 0 || this.state.logs.length >= 500) {
            this.state.logsTruncated = true
            return
        }
        const safe = redactLocalPaths(message)
        const text = safe.slice(0, remaining)
        this.state.logs.push({ stream, message: text })
        this.#logLength += text.length
        if (text.length < safe.length) this.state.logsTruncated = true
    }

    /** Detaches only. S41/S42 choose whether project switching cancels the global
     * service; disposal must not send a late global Stop for a newer controller. */
    dispose(): void {
        if (this.#disposed) return
        this.#disposed = true
        ++this.#submission
        ++this.#trustGeneration
        this.#unsubscribe?.()
        this.#unsubscribe = undefined
        this.#usedRequests.clear()
        this.#liveRuns.clear()
    }
}
