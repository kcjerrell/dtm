import type { AnalysisRequest, AnalysisResponse } from "../analysis"

export type {
    AnalysisRequest as EditorAnalysisRequest,
    AnalysisResponse as EditorAnalysisResponse,
} from "../analysis"

/** Injectable boundary so the editor never depends on a particular Worker transport. */
export interface EditorAnalysisClient {
    analyze(request: AnalysisRequest): Promise<AnalysisResponse>
    dispose(): void
}
