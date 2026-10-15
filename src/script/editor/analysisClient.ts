import type { GeneratedControl, ScriptDiagnostic, SourceRevision } from "../contracts"

/** Serializable request passed to an analyzer worker. */
export interface EditorAnalysisRequest {
    revision: SourceRevision
    source: string
    uri: string
}

/** The editor-facing subset of analyzer output. Analysis owns its implementation. */
export interface EditorAnalysisResponse {
    revision: SourceRevision
    controls: readonly GeneratedControl[]
    diagnostics: readonly ScriptDiagnostic[]
    instrumentedSource: string
    sourceMap?: string
}

/** Injectable boundary so the editor never depends on a particular Worker transport. */
export interface EditorAnalysisClient {
    analyze(request: EditorAnalysisRequest): Promise<EditorAnalysisResponse>
    dispose(): void
}
