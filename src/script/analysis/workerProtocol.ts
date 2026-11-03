import type { AnalysisRequest, AnalysisResponse } from "."

export interface AnalysisWorkerRequest {
    id: number
    request: AnalysisRequest
}

export type AnalysisWorkerReply =
    | { id: number; response: AnalysisResponse }
    | { id: number; error: string }
