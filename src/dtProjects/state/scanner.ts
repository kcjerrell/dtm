import { exists, stat } from "@tauri-apps/plugin-fs"
import { pdb } from "@/commands"
import type { JobCallback } from "@/utils/container/queue"
import {
    type DTPJob,
    type DTPJobSpec,
    DTPStateService,
    type ProjectFilesChangedPayload,
    type WatchFoldersChangedPayload,
} from "./types"
import type { WatchFolderState } from "./watchFolders"
import { getRefreshModelsJob } from "./models"

class ScannerService extends DTPStateService {
    constructor() {
        super("scanner")

        this.container.on("watchFoldersChanged", (e) => this.onWatchFoldersChanged(e))

        this.container.on("projectFilesChanged", async (e) => this.onProjectFilesChanged(e))
    }

    async onWatchFoldersChanged(e: WatchFoldersChangedPayload) {
        const syncFolders = [e.added, e.changed].flat() as WatchFolderState[]
        for (const folder of syncFolders) {
            if (folder.item_type === "ModelInfo") {
                const job = getModelInfoJob(folder.path)
                this.container.getService("jobs").addJob(job)
            } else if (folder.item_type === "Projects") {
                const job = syncProjectFolderJob(folder.path)
                this.container.getService("jobs").addJob(job)
            } else throw new Error("Invalid item type")
        }
        if (e.removed.length > 0) {
            this.syncProjectFolders(undefined, () => {
                this.syncModelInfo()
            })
        }
    }

    async onProjectFilesChanged(e: ProjectFilesChangedPayload) {
        {
            const jobs = []
            for (const projectFile of e.files) {
                const stats = await getProjectStats(projectFile)
                const project = this.container
                    .getService("projects")
                    .state.projects.find((p) => p.path === projectFile)
                if (project?.excluded) continue

                if (!stats || stats === "dne") {
                    if (project) {
                        jobs.push(
                            getProjectJob(projectFile, { action: "remove", size: 0, mtime: 0 }),
                        )
                    }
                    continue
                }

                if (!project) {
                    jobs.push(getProjectJob(projectFile, { action: "add", ...stats }))
                    continue
                }

                jobs.push(getProjectJob(projectFile, { action: "update", ...stats }))
            }
            this.container.getService("jobs").addJobs(jobs)
        }
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
        const result: DTPJob[] = []
        const projects = this.container.getService("projects")

        for (const path of projectPaths) {
            const stats = await getProjectStats(path)
            const project = projects.state.projects.find((p) => p.path === path)

            if (!stats || stats === "dne") {
                if (project) {
                    result.push(getProjectJob(path, { action: "remove", size: 0, mtime: 0 }))
                }
                continue
            }

            if (!project) {
                result.push(getProjectJob(path, { action: "add", ...stats }))
            }

            if (project?.excluded) continue

            if (project?.filesize !== stats.size || project?.modified !== stats.mtime) {
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
    if (!(await exists(projectPath))) return "dne"

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
function syncProjectsJob(callback?: () => void): DTPJob {
    return {
        type: "projects-sync",
        data: undefined,
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

                if (!projectStats || projectStats === "dne") {
                    pd.status = "missing"
                    pd.size = 0
                    pd.mtime = 0
                    continue
                }

                pd.size = projectStats.size
                pd.mtime = projectStats.mtime

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
                    if (projectStats && projectStats !== "dne") {
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

            const jobs = [] as DTPJob[]

            let jobsCreated = 0
            let jobsDone = 0
            const finishedCallback = () => {
                jobsDone++
                if (jobsDone === jobsCreated) {
                    callback?.()
                }
            }

            for (const pd of allProjects.values()) {
                if (pd.action === "none") continue

                const job = getProjectJob(pd.projectFile, pd, finishedCallback)

                if (job?.type === "project-add") {
                    jobs.unshift(job)
                } else if (job?.type === "project-update") {
                    jobs.push(job)
                } else if (job?.type === "project-remove") {
                    jobs.unshift(job)
                }
            }

            jobsCreated = jobs.length

            return { jobs }
        },
    }
}

function syncProjectFolderJob(watchFolder: string, callback?: () => void): DTPJob {
    return {
        type: "project-folder-scan",
        label: watchFolder,
        data: watchFolder,
        callback,
        execute: async (_, container) => {
            const wf = container.services.watchFolders
            const p = container.services.projects

            await wf.loadWatchFolders()
            const folder = wf.state.projectFolders.find((f) => f.path === watchFolder)

            if (!folder) return { jobs: [] }

            await p.loadProjects()

            const folderProjects = await wf.listProjects(folder)
            const updProjects = {} as Record<
                string,
                { size: number; mtime: number; action: "add" | "update" }
            >

            for (const path of folderProjects) {
                const existingProject = p.state.projects.find((pj) => pj.path === path)
                const stats = await getProjectStats(path)

                if (!stats || stats === "dne") {
                    if (existingProject) existingProject.isMissing = true
                    console.log("project is missing")
                    continue
                }

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

            const jobs = [] as DTPJob[]

            let jobsCreated = 0
            let jobsDone = 0
            const finishedCallback = () => {
                jobsDone++
                if (jobsDone === jobsCreated) {
                    callback?.()
                }
            }

            for (const [project, data] of Object.entries(updProjects)) {
                const job = getProjectJob(
                    project,
                    data as Omit<ProjectJobPayload, "project">,
                    finishedCallback,
                )
                if (job?.type === "project-update") jobs.push(job)
                else if (job?.type === "project-add") jobs.unshift(job)
            }

            jobsCreated = jobs.length

            return { jobs }
        },
    }
}

function getProjectJob(
    project: string,
    data: Omit<ProjectJobPayload, "project">,
    callback?: JobCallback,
): DTPJob {
    switch (data.action) {
        case "add":
            return {
                type: "project-add",
                data: [project],
                merge: "first",
                callback,
                execute: async (data: string[], container) => {
                    container.services.uiState.setImportLock(true)
                    for (const p of data) {
                        try {
                            await pdb.addProject(p)
                        } catch (e) {
                            console.error(e)
                        }
                    }
                    for (const p of data) {
                        try {
                            const stats = await getProjectStats(p)
                            if (!stats || stats === "dne") continue
                            await pdb.scanProject(p, false, stats.size, stats.mtime)
                        } catch (e) {
                            console.error(e)
                        }
                    }
                    container.services.uiState.setImportLock(false)
                    return { jobs: [getRefreshModelsJob()] }
                },
            }
        case "update":
            return {
                type: "project-update",
                data: { project, ...data },
                callback,
                execute: async (data: ProjectJobPayload, _container) => {
                    await pdb.scanProject(project, false, data.size, data.mtime)
                },
            }
        case "remove":
            return {
                type: "project-remove",
                data: { project, ...data },
                callback,
                execute: async (_data: ProjectJobPayload, _container) => {
                    await pdb.removeProject(project)
                },
            }
        default:
            throw new Error()
    }
}

function getModelInfoJob(folder: string, callback?: JobCallback): DTPJobSpec<"models-scan"> {
    return {
        type: "models-scan",
        callback,
        data: folder,
        execute: async (folder, container) => {
            const wf = container.services.watchFolders
            const folderState = wf.state.modelInfoFolders.find((f) => f.path === folder)

            if (!folderState) return

            const files = await wf.listModelInfoFiles(folderState)

            for (const file of files) {
                await pdb.scanModelInfo(file.path, file.modelType)
            }
        },
    }
}
