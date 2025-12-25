import { Mutex } from "async-mutex"
import { type DTPContainer, DTPStateService } from "@/dtProjects/state/StateController"
import type { Container } from "./container"
import type { ProjectJobPayload } from "./scanner"

interface JobMap {
	syncProjectFolders: { payload: null; result: null }
	project: { payload: ProjectJobPayload; result: null }
	modelInfo: { payload: null; result: null }
}

export interface JobDef<T = null, R = null> {
	type: string
	action?: string
	data?: T
	execute: (data: T, container: Container<DTPContainer>) => Promise<JobResult<R>> | Promise<void>
	callback?: JobCallback<R>
}

export interface Job<T, R> extends JobDef<T, R> {
	id: number
	status: "pending" | "active" | "completed" | "failed"
	error?: string
	retries?: number
}

export type AnyJob = {
	[K in keyof JobMap]: Job<JobMap[K]["payload"], JobMap[K]["result"]> & { type: K }
}[keyof JobMap]

export type JobPayload = Omit<AnyJob, "id" | "status" | "error" | "retries">

export type JobCallback<R = null> = (result?: R, error?: unknown) => void

export type JobResult<R = null> = {
	jobs?: JobPayload[]
	follow?: JobPayload
	data?: R
}

let id = 0
class JobsService extends DTPStateService {
	jobs: AnyJob[] = []
	isActive = false
	mutex = new Mutex()

	constructor() {
		super("jobs")
	}

	addJob(job: JobPayload, addToFront = false) {
		if (this._isDisposed) throw new Error("JobsService is disposed")

		const item = {
			...job,
			id: id++,
			status: "pending",
		} as AnyJob

		if (addToFront) this.jobs.unshift(item)
		else this.jobs.push(item)

		if (!this.isActive) this.start()
	}

	addJobs(jobs: JobPayload[], addToFront = false) {
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
