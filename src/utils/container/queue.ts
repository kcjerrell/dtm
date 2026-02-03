import { Mutex } from "async-mutex"
import type { IContainer } from "./interfaces"
import { Service } from "./Service"

export type JobTypeMap = {
    [jobType: string]: {
        data: unknown
        result: unknown
    }
}

export interface JobSpec<
    C extends IContainer,
    JM extends JobTypeMap,
    K extends keyof JM = keyof JM,
> {
    type: K
    subtype?: string
    label?: string
    data: JM[K]["data"]
    execute: (
        data: JM[K]["data"],
        container: C,
    ) => Promise<JobResult<JM, K, C> | undefined> | Promise<void>
    callback?: JobCallback<JM[K]["result"]>
    merge?: "first" | "last"
    retries?: number
}

export type JobUnion<C extends IContainer, JM extends JobTypeMap> = {
    [K in keyof JM]: JobSpec<C, JM, K>
}[keyof JM]

export interface Job<C extends IContainer, JM extends JobTypeMap, K extends keyof JM = keyof JM>
    extends JobSpec<C, JM, K> {
    id: number
    status: "pending" | "active" | "completed" | "failed" | "canceled"
    error?: string
    attempts: number
}

export type JobCallback<R = null> = (result?: R, error?: unknown) => void
export type JobResult<
    JM extends JobTypeMap,
    K extends keyof JM,
    C extends IContainer,
> = JM[K]["result"] extends never
    ? {
          jobs?: JobUnion<C, JM>[]
      }
    : {
          data: JM[K]["result"]
          jobs?: JobUnion<C, JM>[]
      }

export class JobQueue<C extends IContainer, JM extends JobTypeMap> extends Service<C> {
    jobs: Job<C, JM>[] = []
    isActive = false
    mutex = new Mutex()

    private static idCounter = 0

    constructor() {
        super("jobs")
    }

    private createJob<K extends keyof JM>(spec: JobSpec<C, JM, K>): Job<C, JM, K> {
        return {
            ...spec,
            id: JobQueue.idCounter++,
            status: "pending",
            attempts: 0,
        }
    }

    addJob(job: JobUnion<C, JM>, addToFront = false) {
        if (this._isDisposed) throw new Error("JobsService is disposed")

        const item = this.createJob(job)

        // if .merge is set, we need to ensure that this job is the only job with the same type and tag
        if (item.merge === "first") {
            // merge all instances into the first position, and replace with this instance
            let firstIndex: number | null = null
            const callbacks: JobCallback[] = []
            const jobsData = []
            this.jobs.forEach((j, i) => {
                if (j.type === item.type && j.subtype === item.subtype) {
                    firstIndex = firstIndex === null ? i : Math.min(firstIndex, i)
                    j.status = "canceled"
                    if (Array.isArray(j.data)) jobsData.push(...j.data)
                    if (j.callback) callbacks.push(j.callback)
                }
            })
            if (firstIndex !== null) {
                this.jobs.splice(firstIndex, 1, item)
                if (Array.isArray(item.data)) item.data.unshift(...jobsData)
                console.debug("merged job", formatJob(item))
                const itemCallback = item.callback
                item.callback = (result, error) => {
                    for (const callback of callbacks) {
                        callback(result, error)
                    }
                    itemCallback?.(result, error)
                }
                return
            }
            // if no matching jobs were found, continue as if normal
        }
        if (item.merge === "last") {
            // cancel all jobs jobs of same type tag, add this one to the end of the queue
            if (addToFront) throw new Error("Cannot add job to front with merge=last")
            const callbacks: JobCallback[] = []
            const jobsData = []
            this.jobs.forEach((j) => {
                if (j.type === item.type && j.subtype === item.subtype) {
                    j.status = "canceled"
                    if (Array.isArray(j.data)) jobsData.push(...j.data)
                    if (j.callback) callbacks.push(j.callback)
                }
            })
            this.jobs.push(item)
            if (Array.isArray(item.data)) item.data.unshift(...jobsData)
            console.debug("merged job", formatJob(item))
            const itemCallback = item.callback
            item.callback = (result, error) => {
                for (const callback of callbacks) {
                    callback(result, error)
                }
                itemCallback?.(result, error)
            }
            return
        }

        if (addToFront) this.jobs.unshift(item)
        else this.jobs.push(item)

        console.debug("added job", formatJob(item))

        if (!this.isActive) this.start()
    }

    addJobs(jobs: JobUnion<C, JM>[], addToFront = false) {
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
                    console.log("starting job", formatJob(job))
                    const result = await job.execute(job.data, this.container)

                    if (Array.isArray(result?.jobs) && result.jobs.length > 0) {
                        this.addJobs(result.jobs)
                    }

                    job.status = "completed"

                    job.callback?.(result?.data)
                    console.debug("completed job", formatJob(job))
                } catch (error) {
                    job.status = "failed"
                    job.error = error instanceof Error ? error.message : String(error)
                    job.attempts += 1

                    job.callback?.(undefined, error)

                    if (job.attempts < (job.retries ?? 0)) {
                        const { id, status, error, attempts, ...spec } = job
                        this.addJob(spec, false)
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

function formatJob<C extends IContainer, JM extends JobTypeMap>(job: Job<C, JM>) {
    let formatted = `${job.id}:${String(job.type)}`

    if (job.subtype) formatted += `:${job.subtype}`
    if (job.label) formatted += `:${job.label}`
    return formatted
}
