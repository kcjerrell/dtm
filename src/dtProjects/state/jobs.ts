import { Mutex } from "async-mutex"
import type { Model } from "@/commands"
import { type DTPContainer, DTPStateService } from "@/dtProjects/state/StateController"
import type { Container } from "./container"
import type { ProjectJobPayload } from "./scanner"


export interface JobDef {
    type: string
    action?: string
    data?: unknown
    execute: (
        data: unknown,
        container: Container<DTPContainer>,
    ) => Promise<JobResult<unknown>> | Promise<void>
    callback?: JobCallback<unknown>
    merge?: "first" | "last"
}

export interface Job extends JobDef {
    id: number
    status: "pending" | "active" | "completed" | "failed" | "canceled"
    error?: string
    retries?: number
}

export type JobCallback<R = null> = (result?: R, error?: unknown) => void

export type JobResult<R = null> = {
    jobs?: Job[]
    follow?: Job
    data?: R
}

let id = 0
class JobsService extends DTPStateService {
    jobs: Job[] = []
    isActive = false
    mutex = new Mutex()

    constructor() {
        super("jobs")
    }

    addJob(job: JobDef, addToFront = false) {
        if (this._isDisposed) throw new Error("JobsService is disposed")

        const item = {
            ...job,
            id: id++,
            status: "pending",
        } as Job

        // replace first job with this one, and cancel all others
        if (item.merge === "first") {
            const index = this.jobs.findIndex(
                (j) => j.type === item.type && j.action === item.action,
            )
            if (index !== -1) {
                this.jobs.splice(index, 1, item)
                return
            }
            this.jobs.forEach((j) => {
                if (j.type === item.type && j.action === item.action) {
                    j.status = "canceled"
                }
            })
            return
        }
        // cancel all jobs before this one
        if (item.merge === "last") {
            if (addToFront) throw new Error("Cannot add job to front with merge last")
            this.jobs.forEach((j) => {
                if (j.type === item.type && j.action === item.action) {
                    j.status = "canceled"
                }
            })
        }

        if (addToFront) this.jobs.unshift(item)
        else this.jobs.push(item)

        if (!this.isActive) this.start()
    }

    addJobs(jobs: Job[], addToFront = false) {
        for (const job of jobs) {
            this.addJob(job, addToFront)
        }
    }

    async start() {
        if (this.isActive) return
        this.isActive = true
        await this.mutex.runExclusive(async () => {
            while (this.jobs.length > 0) {
                if (this._isDisposed) throw new Error("JobsService is disposed")

                const job = this.jobs.shift()
                if (!job) break

                if (job.status === "canceled") continue

                job.status = "active"
 
                try {
                    const result = await job.execute(job.data, this.container)

                    if (Array.isArray(result?.jobs) && result.jobs.length > 0) {
                        this.addJobs(result.jobs)
                    }

                    if (result?.follow) {
                        this.addJob(result.follow, true)
                    }

                    job.status = "completed"

                    job.callback?.(result?.data)
                } catch (error) {
                    job.status = "failed"
                    job.error = error instanceof Error ? error.message : String(error)
                    job.retries = (job.retries ?? 0) + 1

                    job.callback?.(undefined, error)

                    if (job.retries < 3) {
                        this.addJob(job, false)
                    } else {
                        job.status = "failed"
                        console.error("a job failed", job)
                    }
                }
            }
        })
        this.isActive = false
    }
}

export default JobsService
