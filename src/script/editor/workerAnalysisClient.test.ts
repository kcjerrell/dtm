import { describe, expect, it, vi } from "vitest"
import type { AnalysisResponse } from "../analysis"
import type { AnalysisWorkerReply, AnalysisWorkerRequest } from "../analysis/workerProtocol"
import type { SourceRevision } from "../contracts"
import { createWorkerAnalysisClient } from "./workerAnalysisClient"

function fakeWorker() {
    const worker = {
        postMessage: vi.fn<(message: AnalysisWorkerRequest) => void>(),
        terminate: vi.fn(),
        onmessage: null as ((event: MessageEvent<AnalysisWorkerReply>) => void) | null,
        onerror: null as ((event: ErrorEvent) => void) | null,
        onmessageerror: null as (() => void) | null,
    }
    const reply = (data: AnalysisWorkerReply) =>
        worker.onmessage?.(new MessageEvent("message", { data }))
    return { worker, reply }
}

const sourceRevision = 1 as SourceRevision
const result = (instrumentedSource: string): AnalysisResponse => ({
    sourceRevision,
    controls: [],
    diagnostics: [],
    instrumentedSource,
})

describe("analyzer Worker transport", () => {
    it("correlates out-of-order replies from different projects with identical revisions", async () => {
        const { worker, reply } = fakeWorker()
        const client = createWorkerAnalysisClient(() => worker)
        const first = client.analyze({ sourceRevision, source: "first", fileName: "first.ts" })
        const second = client.analyze({ sourceRevision, source: "second", fileName: "second.ts" })
        const [a, b] = worker.postMessage.mock.calls.map(([message]) => message.id)
        expect(a).not.toBe(b)
        reply({ id: b, response: result("second") })
        reply({ id: a, response: result("first") })
        await expect(first).resolves.toEqual(result("first"))
        await expect(second).resolves.toEqual(result("second"))
        client.dispose()
    })

    it("rejects individual request errors and rejects all pending work on worker errors", async () => {
        const first = fakeWorker()
        const second = fakeWorker()
        const create = vi.fn().mockReturnValueOnce(first.worker).mockReturnValueOnce(second.worker)
        const client = createWorkerAnalysisClient(create)
        const request = { sourceRevision, source: "source" }
        const individual = client.analyze(request)
        first.reply({ id: first.worker.postMessage.mock.calls[0][0].id, error: "bad request" })
        await expect(individual).rejects.toThrow("bad request")

        const pending = [client.analyze(request), client.analyze(request)]
        const error = { preventDefault: vi.fn() } as unknown as ErrorEvent
        first.worker.onerror?.(error)
        await Promise.all(
            pending.map((operation) => expect(operation).rejects.toThrow("worker failed")),
        )
        expect(first.worker.terminate).toHaveBeenCalledOnce()

        const retry = client.analyze(request)
        second.reply({
            id: second.worker.postMessage.mock.calls[0][0].id,
            response: result("retry"),
        })
        await expect(retry).resolves.toEqual(result("retry"))
        const unfinished = client.analyze(request)
        client.dispose()
        await expect(unfinished).rejects.toThrow("disposed")
        expect(second.worker.terminate).toHaveBeenCalledOnce()
        expect(second.worker.onmessage).toBeNull()
        await expect(client.analyze(request)).rejects.toThrow("disposed")
    })
})
