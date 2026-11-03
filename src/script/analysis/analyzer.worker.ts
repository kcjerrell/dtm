import { analyzeScript } from "."
import type { AnalysisWorkerReply, AnalysisWorkerRequest } from "./workerProtocol"

const scope: {
    onmessage: ((event: MessageEvent<AnalysisWorkerRequest>) => void) | null
    postMessage(reply: AnalysisWorkerReply): void
} = self

scope.onmessage = ({ data: { id, request } }) => {
    try {
        scope.postMessage({ id, response: analyzeScript(request) })
    } catch (error) {
        scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
    }
}
