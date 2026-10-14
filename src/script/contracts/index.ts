export const PROJECT_MANIFEST_SCHEMA_VERSION = 1 as const
export const RUN_MANIFEST_SCHEMA_VERSION = 1 as const

type Brand<Value, Name extends string> = Value & { readonly __brand: Name }

export type ProjectId = Brand<string, "ProjectId">
export type RunId = Brand<string, "RunId">
export type ClientRequestId = Brand<string, "ClientRequestId">
export type SourceRevision = Brand<number, "SourceRevision">
export type ValueRevision = Brand<number, "ValueRevision">
export type InputRevision = Brand<number, "InputRevision">

export interface ProjectManifest {
    schemaVersion: typeof PROJECT_MANIFEST_SCHEMA_VERSION
    projectId: ProjectId
    displayName: string
    entryFile: string
}

export interface SourcePosition {
    line: number
    column: number
    offset: number
}

export interface SourceRange {
    start: SourcePosition
    end: SourcePosition
}

export type DiagnosticSource =
    | "typescript"
    | "analyzer"
    | "bun"
    | "userRuntime"
    | "runner"
    | "outputValidation"
    | "timeout"
    | "cancellation"
    | "dependency"
export type DiagnosticSeverity = "error" | "warning" | "info"

export interface ScriptDiagnostic {
    source: DiagnosticSource
    severity: DiagnosticSeverity
    message: string
    code?: string
    location?: { file: string; range: SourceRange }
}

interface ControlBase {
    id: string
    label: string
    sourceRange: SourceRange
}

export type GeneratedControl =
    | (ControlBase & { type: "image"; required: boolean })
    | (ControlBase & {
          type: "number"
          defaultValue: number
          min?: number
          max?: number
          step?: number
      })
    | (ControlBase & {
          type: "slider"
          defaultValue: number
          min: number
          max: number
          step: number
      })
    | (ControlBase & { type: "boolean"; defaultValue: boolean })
    | (ControlBase & { type: "text"; defaultValue: string })

export type ControlValue =
    | { type: "number"; value: number }
    | { type: "boolean"; value: boolean }
    | { type: "text"; value: string }

export type SelectedInput =
    | { type: "localFile"; inputId: string; displayName: string; selectionToken: string }
    | {
          type: "drawThings"
          inputId: string
          displayName: string
          resourceId: string
      }

export interface MaterializedInput {
    inputId: string
    fileName: string
    mediaType: string
    byteLength: number
    contentHash: string
}

export interface SourceSnapshot {
    sourceRevision: SourceRevision
    contentHash: string
    source: string
    instrumentedSource: string
    sourceMap?: string
}

export interface RunIdentity {
    projectId: ProjectId
    runId: RunId
    clientRequestId: ClientRequestId
    sourceRevision: SourceRevision
    valueRevision: ValueRevision
    inputRevision: InputRevision
}

export interface RunRequest {
    projectId: ProjectId
    clientRequestId: ClientRequestId
    source: SourceSnapshot
    valueRevision: ValueRevision
    inputRevision: InputRevision
    values: Readonly<Record<string, ControlValue>>
    inputs: readonly SelectedInput[]
}

export interface RunManifest {
    schemaVersion: typeof RUN_MANIFEST_SCHEMA_VERSION
    identity: RunIdentity
    source: SourceSnapshot
    values: Readonly<Record<string, ControlValue>>
    inputs: readonly MaterializedInput[]
}

export interface OutputMetadata {
    previewUrl: string
    mediaType: string
    byteLength: number
    width?: number
    height?: number
}

export type ScriptRunEvent =
    | { type: "queued"; identity: RunIdentity }
    | { type: "started"; identity: RunIdentity; startedAt: string }
    | {
          type: "log"
          identity: RunIdentity
          stream: "stdout" | "stderr"
          message: string
      }
    | { type: "diagnostic"; identity: RunIdentity; diagnostic: ScriptDiagnostic }
    | { type: "succeeded"; identity: RunIdentity; output: OutputMetadata }
    | { type: "failed"; identity: RunIdentity; diagnostic: ScriptDiagnostic }
    | { type: "cancelled"; identity: RunIdentity; reason: "superseded" | "user" | "shutdown" }

export interface ContractFixtures {
    projectManifest: ProjectManifest
    controls: GeneratedControl[]
    values: ControlValue[]
    selectedInputs: SelectedInput[]
    materializedInputs: MaterializedInput[]
    diagnostics: ScriptDiagnostic[]
    runRequest: RunRequest
    runManifest: RunManifest
    outputs: OutputMetadata[]
    events: ScriptRunEvent[]
}
