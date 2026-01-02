import { exists, stat } from "@tauri-apps/plugin-fs"
import { pdb } from "@/commands"
import { DTPStateService } from "@/dtProjects/state/StateController"
import type { JobCallback, JobDef, JobPayload, JobResult } from "./jobs"

class ScannerService extends DTPStateService {
    constructor() {
        super("scanner")

        this.container.on("watchFoldersChanged", (e) => {
            console.log("caught an event", e)
            const syncFolders = [e.added, e.changed].flat()
            for (const folder of syncFolders) {
                if (folder.item_type === "ModelInfo") {
                    const job = getModelInfoJob(folder.path)
                    this.container.getService("jobs").addJob(job)
                } else if (folder.item_type === "Projects") {
                    const job = syncProjectFolderJob(folder.path)
                    this.container.getService("jobs").addJob(job)
                } else throw new Error("Invalid item type")
            }
            if (e.removed) {
                this.syncProjectFolders(undefined, () => {
                    console.log("sync finished")
                    this.syncModelInfo()
                })
            }
        })

        this.container.on("projectFilesChanged", async (e) => {
            const jobs = []
            for (const project of e.files) {
                const stats = await getProjectStats(project)
                if (!stats) continue
                jobs.push(getProjectJob(project, { action: "update", ...stats }))
            }
            this.container.getService("jobs").addJobs(jobs)
        })
    }

    /**
     * if watchfolder provided, the projects in that folder will be add/updated to the db. This won't
     * remove any projects.
     * If not provided, every project in the db and every project in the watchfolders will be checked.
     * This may remove projects, if the project file is missing and thw watchfolder is still present
     */
    syncProjectFolders(watchFolder?: string, callback?: JobCallback<null>) {
        if (watchFolder) {
            const job = syncProjectFolderJob(watchFolder, () => {
                callback?.()
            })
            this.container.getService("jobs").addJob(job)
        } else {
            const job = syncProjectsJob(() => {
                callback?.()
            })
            this.container.getService("jobs").addJob(job)
        }
    }

    async syncProjects(projectPaths: string[], callback?: JobCallback<null>) {
        const result: JobPayload[] = []
        const projects = this.container.getService("projects")

        for (const path of projectPaths) {
            const stats = await getProjectStats(path)
            const project = projects.state.projects.find((p) => p.path === path)

            if (!stats) {
                if (project) {
                    result.push(getProjectJob(path, { action: "remove", size: 0, mtime: 0 }))
                }
                continue
            }

            if (!project) {
                result.push(getProjectJob(path, { action: "add", ...stats }))
            } else if (project.filesize !== stats.size || project.modified !== stats.mtime) {
                result.push(getProjectJob(path, { action: "update", ...stats }))
            }
        }

        if (result.length > 0) {
            this.container.getService("jobs").addJobs(result)
        }

        callback?.()
    }

    async syncModelInfo() {
        const wf = this.container.getService("watchFolders")

        await wf.loadWatchFolders()

        for (const folder of wf.state.modelInfoFolders) {
            const job = getModelInfoJob(folder.path)
            this.container.getService("jobs").addJob(job)
        }
    }

    override dispose() {
        super.dispose()
    }
}

export default ScannerService

async function getProjectStats(projectPath: string) {
    if (!projectPath.endsWith(".sqlite3")) return null
    if (!(await exists(projectPath))) return null

    const stats = await stat(projectPath)

    let walStats: Pick<Awaited<ReturnType<typeof stat>>, "size" | "mtime"> = {
        size: 0,
        mtime: new Date(0),
    }
    if (await exists(`${projectPath}-wal`)) {
        walStats = await stat(`${projectPath}-wal`)
    }

    return {
        size: stats.size + walStats.size,
        mtime: Math.max(stats.mtime?.getTime() || 0, walStats.mtime?.getTime() || 0),
    }
}

export type ProjectJobPayload = {
    action: "add" | "update" | "remove" | "none"
    project: string
    size: number
    mtime: number
}

/** this job syncs all projects in the db with all watch folders */
function syncProjectsJob(callback?: () => void): JobDef<null> & { type: "syncProjectFolders" } {
    return {
        type: "syncProjectFolders",
        execute: async (_, container) => {
            const wf = container.services.watchFolders
            const p = container.services.projects

            type ProjectDesc = {
                projectFile: string
                size: number
                mtime: number
                status: "unknown" | "new" | "changed" | "missing" | "unchanged"
                action: "none" | "remove" | "add" | "update"
                isOrphaned?: boolean
            }
            let allProjects: Map<string, ProjectDesc>
            const cpd = (projectFile: string) =>
                ({
                    projectFile,
                    size: -1,
                    mtime: -1,
                    status: "unknown",
                    action: "none",
                }) as ProjectDesc
            const getPd = (projectFile: string) => {
                if (!allProjects.has(projectFile)) allProjects.set(projectFile, cpd(projectFile))
                const pd = allProjects.get(projectFile)
                if (!pd) throw new Error("Project not found")
                return pd
            }

            await p.loadProjects()
            allProjects = new Map(p.state.projects.map((p) => [p.path, cpd(p.path)]))

            // iterate over known projects (in the db already)
            for (const project of p.state.projects) {
                const projectStats = await getProjectStats(project.path)
                const pd = getPd(project.path)
                pd.size = projectStats?.size ?? 0
                pd.mtime = projectStats?.mtime ?? 0

                if (projectStats === null) {
                    pd.status = "missing"
                    continue
                }

                if (project.filesize !== pd.size || project.modified !== pd.mtime) {
                    pd.status = "changed"
                } else {
                    pd.status = "unchanged"
                }
            }

            await wf.loadWatchFolders()

            // iterate over project files in each watch folder
            for (const folder of wf.state.projectFolders) {
                const folderProjects = await wf.listProjects(folder)
                for (const project of folderProjects) {
                    const pd = getPd(project)
                    if (pd.status !== "unknown") continue

                    const projectStats = await getProjectStats(project)
                    if (projectStats) {
                        pd.status = "new"
                        pd.size = projectStats.size
                        pd.mtime = projectStats.mtime
                    }
                }
            }

            // assign actions
            for (const pd of allProjects.values()) {
                if (pd.status === "new") pd.action = "add"
                else if (pd.status === "changed") pd.action = "update"

                // check if project is orphaned
                const folder = await wf.getFolderForProject(pd.projectFile)
                if (!folder) {
                    pd.isOrphaned = true
                    pd.action = "remove"
                }

                if (pd.status === "missing" && !pd.isOrphaned) {
                    // if project is missing, do nothing if folder is also missing
                    // keep this project in db to support removable storage
                    pd.action = "remove"
                }
            }

            const jobs = [] as JobDef<ProjectJobPayload>[]

            let jobsCreated = 0
            let jobsDone = 0
            const finishedCallback = () => {
                jobsDone++
                if (jobsDone === jobsCreated) {
                    console.log("jobs done")
                    callback?.()
                }
            }

            for (const pd of allProjects.values()) {
                if (pd.action === "none") continue

                const job = getProjectJob(pd.projectFile, pd, finishedCallback)

                if (job?.action === "add") {
                    jobs.unshift(job)
                } else if (job?.action === "update") {
                    jobs.push(job)
                } else if (job?.action === "remove") {
                    jobs.unshift(job)
                }
            }

            jobsCreated = jobs.length

            return { jobs } as JobResult
        },
    }
}

function syncProjectFolderJob(
    watchFolder: string,
    callback?: () => void,
): JobDef<null> & { type: "syncProjectFolders" } {
    return {
        type: "syncProjectFolders",
        callback,
        execute: async (_, container) => {
            const wf = container.services.watchFolders
            const p = container.services.projects

            await wf.loadWatchFolders()
            const folder = wf.state.projectFolders.find((f) => f.path === watchFolder)

            if (!folder) return { jobs: [] } as JobResult<null>

            await p.loadProjects()

            const folderProjects = await wf.listProjects(folder)
            const updProjects = {} as Record<
                string,
                { size: number; mtime: number; action: "add" | "update" }
            >

            for (const path of folderProjects) {
                const existingProject = p.state.projects.find((pj) => pj.path === path)
                const stats = await getProjectStats(path)

                if (!stats) continue

                if (existingProject) {
                    if (
                        existingProject.filesize !== stats.size ||
                        existingProject.modified !== stats.mtime
                    ) {
                        updProjects[path] = { ...stats, action: "update" }
                    }
                } else {
                    updProjects[path] = { ...stats, action: "add" }
                }
            }

            const jobs = [] as JobPayload[]
            for (const [project, data] of Object.entries(updProjects)) {
                const job = getProjectJob(project, data as Omit<ProjectJobPayload, "project">)
                if (job?.action === "update") jobs.push(job)
                else if (job?.action === "add") jobs.unshift(job)
            }

            return { jobs } as JobResult<null>
        },
    }
}

function getProjectJob(
    project: string,
    data: Omit<ProjectJobPayload, "project">,
    callback?: JobCallback,
): (JobDef<ProjectJobPayload> & { type: "project" }) | undefined {
    switch (data.action) {
        case "add":
            return {
                type: "project",
                action: "add",
                data: { project, ...data },
                callback,
                execute: async (data: ProjectJobPayload, _container) => {
                    await pdb.addProject(data.project)
                    return {
                        jobs: [getProjectJob(project, { ...data, action: "update" })],
                    } as JobResult
                },
            }
        case "update":
            return {
                type: "project",
                action: "update",
                data: { project, ...data },
                callback,
                execute: async (data: ProjectJobPayload, _container) => {
                    await pdb.scanProject(project, false, data.size, data.mtime)
                },
            }
        case "remove":
            return {
                type: "project",
                action: "remove",
                data: { project, ...data },
                callback,
                execute: async (_data: ProjectJobPayload, _container) => {
                    await pdb.removeProject(project)
                },
            }
    }
}

function getModelInfoJob(folder: string, callback?: JobCallback): JobDef {
    return {
        type: "modelInfo",
        callback,
        data: folder,
        execute: async (folder: string, container) => {
            const wf = container.services.watchFolders
            const folderState = wf.state.modelInfoFolders.find((f) => f.path === folder)

            if (!folderState) return

            const files = await wf.listModelInfoFiles(folderState)

            for (const file of files) {
                console.log("scanning model info", file.path)
                await pdb.scanModelInfo(file.path, file.modelType)
            }
        },
    }
}
