import type { AnalysisResponse } from "../analysis"
import type { AnalysisWorkerReply, AnalysisWorkerRequest } from "../analysis/workerProtocol"
import type { EditorAnalysisClient } from "./analysisClient"

type AnalysisWorker = Pick<Worker, "postMessage" | "terminate" | "onerror" | "onmessageerror"> & {
    onmessage: ((event: MessageEvent<AnalysisWorkerReply>) => void) | null
}

export function createWorkerAnalysisClient(
    createWorker: () => AnalysisWorker = () =>
        new Worker(new URL("../analysis/analyzer.worker.ts", import.meta.url), { type: "module" }),
): EditorAnalysisClient {
    const pending = new Map<
        number,
        { resolve(response: AnalysisResponse): void; reject(error: Error): void }
    >()
    let worker: AnalysisWorker | undefined
    let nextId = 0
    let disposed = false

    function stop(error: Error) {
        if (worker) {
            worker.onmessage = null
            worker.onerror = null
            worker.onmessageerror = null
            worker.terminate()
            worker = undefined
        }
        for (const request of pending.values()) request.reject(error)
        pending.clear()
    }

    function start(): AnalysisWorker {
        const instance = createWorker()
        instance.onmessage = ({ data }) => {
            const request = pending.get(data.id)
            if (worker !== instance || !request) return
            pending.delete(data.id)
            if ("error" in data) request.reject(new Error(data.error))
            else request.resolve(data.response)
        }
        instance.onerror = (event) => {
            event.preventDefault()
            if (worker === instance) stop(new Error("Script analysis worker failed"))
        }
        instance.onmessageerror = () => {
            if (worker === instance)
                stop(new Error("Script analysis worker returned unreadable data"))
        }
        return instance
    }

    return {
        analyze(request) {
            if (disposed) return Promise.reject(new Error("Script analysis worker is disposed"))
            return new Promise((resolve, reject) => {
                const id = ++nextId
                try {
                    worker ??= start()
                    pending.set(id, { resolve, reject })
                    worker.postMessage({ id, request } satisfies AnalysisWorkerRequest)
                } catch (error) {
                    pending.delete(id)
                    reject(error)
                }
            })
        },
        dispose() {
            if (disposed) return
            disposed = true
            stop(new Error("Script analysis worker is disposed"))
        },
    }
}
