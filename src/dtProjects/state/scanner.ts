import { exists, stat } from "@tauri-apps/plugin-fs"
import { type ProjectExtra, pdb } from "@/commands"
import type { JobCallback } from "@/utils/container/queue"
import { TMap } from "@/utils/TMap"
import { syncModelInfoJob } from "../jobs/models"
import { getRefreshModelsJob } from "./models"
import {
    type DTPContainer,
    type DTPJob,
    DTPStateService,
    type ProjectFilesChangedPayload,
    type SyncScope,
    type WatchFoldersChangedPayload,
} from "./types"
import type { ListModelInfoFilesResult, ProjectFileStats, WatchFolderState } from "./watchFolders"
import { ProjectState } from "./projects"

class ScannerService extends DTPStateService {
    constructor() {
        super("scanner")
        this.container.on("watchFoldersChanged", (e) => this.onWatchFoldersChanged(e))
        this.container.on("projectFilesChanged", async (e) => this.onProjectFilesChanged(e))
    }

    async onWatchFoldersChanged(e: WatchFoldersChangedPayload) {
        const syncFolders = [e.added, e.changed].flat() as WatchFolderState[]
        if (syncFolders.length > 0) {
            this.sync({ watchFolders: syncFolders }, () => {
                console.log("sync finished?")
            })
        }
        if (e.removed.length > 0) {
            this.sync({}, () => {
                console.log("sync finished?")
            })
        }
    }

    async onProjectFilesChanged(e: ProjectFilesChangedPayload) {
        this.syncProjects(e.files)
    }

    sync(scope: SyncScope, callback?: JobCallback<null>) {
        console.log("starting sync job", scope)
        const callbackWrapper = () => {
            console.log("sync finished")
            callback?.()
        }
        const job = createSyncJob(scope, callbackWrapper)
        this.container.getService("jobs").addJob(job)
    }

    async syncProjects(projects: (ProjectState | string)[], callback?: JobCallback<null>) {
        const wfs = this.container.getService("watchFolders")
        const projectStats = (
            await Promise.all(
                projects.map(async (p) => {
                    const path = typeof p === "string" ? p : p.path
                    const folder = await wfs.getFolderForProject(path)
                    return getProjectStats(p, folder)
                }),
            )
        ).filter(Boolean) as ProjectFileStats[]
        this.sync({ projects: projectStats }, callback)
    }

    override dispose() {
        super.dispose()
    }
}

export default ScannerService

async function getProjectStats(
    project: ProjectState | string,
    watchFolder?: WatchFolderState,
): Promise<ProjectFileStats | undefined> {
    const projectPath = typeof project === "string" ? project : project.path
    try {
        if (!projectPath.endsWith(".sqlite3")) return undefined
        if (!(await exists(projectPath))) return undefined

        const stats = await stat(projectPath)

        let walStats: Pick<Awaited<ReturnType<typeof stat>>, "size" | "mtime"> = {
            size: 0,
            mtime: new Date(0),
        }
        if (await exists(`${projectPath}-wal`)) {
            walStats = await stat(`${projectPath}-wal`)
        }

        return {
            path: projectPath,
            size: stats.size + walStats.size,
            modified: Math.max(stats.mtime?.getTime() || 0, walStats.mtime?.getTime() || 0),
            watchFolderId: watchFolder?.id ?? (typeof project !== "string" ? project.watchfolder_id : undefined),
            watchFolderPath: watchFolder?.path,
        }
    } catch (e) {
        console.warn("can't get project stats", projectPath, e)
        return undefined
    }
}

export type ProjectJobPayload = {
    action: "add" | "update" | "remove" | "none" | "mark-missing"
    projectId: number
    size: number
    mtime: number
}

function getSyncScopeLabel(scope: SyncScope) {
    if (scope.watchFolders) {
        const folders = scope.watchFolders.map((f) => f.path.split("/").pop())
        return `Sync for folders: ${folders.join(", ")}`
    }
    if (scope.projects) {
        const projects = scope.projects.map((p) => p.path.split("/").pop())
        return `Sync for projects: ${projects.join(", ")}`
    }
    return "Full sync"
}

function createSyncJob(scope: SyncScope, callback?: JobCallback<null>): DTPJob {
    const label = getSyncScopeLabel(scope)
    return {
        type: "data-sync",
        label,
        data: scope,
        execute: getExecuteSync(callback),
    }
}

type ProjectSyncObject = {
    file?: ProjectFileStats
    entity?: ProjectExtra
    isMissing: boolean
    action: "add" | "remove" | "update" | "none" | "mark-missing"
}

function getSyncObject(opts: Partial<ProjectSyncObject>): ProjectSyncObject {
    return {
        file: opts.file,
        entity: opts.entity,
        isMissing: opts.isMissing ?? false,
        action: opts.action ?? "none",
    }
}

function getExecuteSync(callback?: JobCallback<null>) {
    async function executeSync(scope: SyncScope, container: DTPContainer) {
        const wfs = container.services.watchFolders
        const ps = container.services.projects

        const folderScoped = !!scope.watchFolders && scope.watchFolders.length > 0
        const projectScoped = !!scope.projects && scope.projects.length > 0

        if (folderScoped && projectScoped) throw new Error("not supported at this time")

        const watchFolders =
            (await (async () => {
                if (folderScoped) return scope.watchFolders
                if (projectScoped) return []
                await wfs.loadWatchFolders(true)
                return wfs.state.folders
            })()) ?? []

        const modelFiles = [] as ListModelInfoFilesResult[]
        const projectFiles = [] as ProjectFileStats[]
        console.log("sync watchfolders", watchFolders)
        for (const folder of watchFolders) {
            const folderFiles = await wfs.listFiles(folder)
            console.log("folderFiles", folderFiles)
            modelFiles.push(...folderFiles.models)
            projectFiles.push(...folderFiles.projects)
        }
        if (projectScoped) {
            projectFiles.push(...(scope.projects ?? []))
        }

        // gather ENTITIES
        await ps.loadProjects()
        const projectEntities = TMap.from(ps.state.projects, (p) => p.path)

        if (folderScoped && watchFolders?.length) {
            projectEntities.retain((_, pState) =>
                watchFolders.some((f) => f.id === pState.watchfolder_id),
            )
        } else if (projectScoped && scope.projects?.length) {
            const scopedProjects = new Set(scope.projects.map((p) => p.path))
            projectEntities.retain((path) => scopedProjects.has(path))
        }

        const syncs = [] as ProjectSyncObject[]

        for (const projectFile of projectFiles) {
            const project = getSyncObject({
                file: projectFile,
                entity: projectEntities.take(projectFile.path),
            })
            syncs.push(project)
        }

        for (const projectEntity of projectEntities.values()) {
            const project = getSyncObject({
                entity: projectEntity,
            })
            // if a project is not covered by a watchfolder, we can stop searching for a file
            const projectFolder = await wfs.getFolderForProject(projectEntity.path)
            if (!projectFolder) {
                syncs.push(project)
                continue
            }

            const projectStats = await getProjectStats(projectEntity)
            if (projectStats)
                project.file = { ...projectStats, watchFolderPath: projectFolder.path }
            else project.isMissing = true
            syncs.push(project)
        }

        // create jobs from the entity/file pairs
        const jobs = [] as DTPJob[]

        for (const project of syncs) {
            // file with no entity, add new project
            if (project.file && !project.entity) project.action = "add"
            // entity with no file, remove or mark missing
            else if (!project.file && project.entity) {
                const folder = await wfs.getFolderForProject(project.entity.path)
                if (folder?.isMissing) project.action = "mark-missing"
                else project.action = "remove"
            }
            // update if sizes or modified times are different
            else if (project.file && project.entity && !project.entity.excluded) {
                if (
                    project.file.size !== project.entity.filesize ||
                    project.file.modified !== project.entity.modified
                )
                    project.action = "update"
            }
        }

        let jobsCreated = 0
        let jobsCompleted = 0

        const jobCallback = () => {
            jobsCompleted++
            if (jobsCompleted === jobsCreated) callback?.()
        }

        // create jobs
        for (const project of syncs) {
            if (project.action === "none") continue
            const projectPath = project.file?.path ?? project.entity?.path
            if (!projectPath) continue
            const job = getProjectJob(project, jobCallback)
            if (job) jobs.push(job)
        }

        if (modelFiles.length > 0) {
            jobs.push(syncModelInfoJob(modelFiles, jobCallback))
        }

        jobsCreated = jobs.length

        return { jobs }
    }

    return executeSync
}

function getProjectJob(data: ProjectSyncObject, callback?: JobCallback): DTPJob | undefined {
    switch (data.action) {
        case "add":
            if (!data.file) {
                console.warn("can't create 'project-add' job without file stats")
                return undefined
            }
            return {
                type: "project-add",
                data: [data.file],
                merge: "first",
                callback,
                execute: async (data: ProjectFileStats[], container) => {
                    container.services.uiState.setImportLock(true)
                    const projects = [] as [ProjectFileStats, ProjectExtra][]
                    // there are two loops here because of the way the progress bar works
                    // the first loop creates the projects and gives the progress bar a total count
                    // the second loop scans each project and advances the progress bar
                    for (const p of data) {
                        try {
                            if (!p.watchFolderId) {
                                console.warn(
                                    "can't create 'project-add' job without watchfolder id",
                                )
                                continue
                            }
                            let relativePath = p.path
                            if (p.watchFolderPath && p.path.startsWith(p.watchFolderPath)) {
                                relativePath = p.path.slice(p.watchFolderPath.length)
                                if (relativePath.startsWith("/")) relativePath = relativePath.slice(1)
                            }
                            const project = await pdb.addProject(p.watchFolderId, relativePath)
                            if (project) projects.push([p, project])
                        } catch (e) {
                            console.error(e)
                        }
                    }
                    for (const [p, project] of projects) {
                        try {
                            await pdb.scanProject(project.id, false, p.size, p.modified)
                        } catch (e) {
                            console.error(e)
                        }
                    }
                    container.services.uiState.setImportLock(false)
                    return { jobs: [getRefreshModelsJob()] }
                },
            }
        case "update":
            if (!data.file || !data.entity) {
                console.warn("can't create 'project-update' job without file stats")
                return undefined
            }
            return {
                type: "project-update",
                data: {
                    projectId: data.entity?.id,
                    mtime: data.file?.modified,
                    size: data.file?.size,
                    action: "update",
                },
                callback,
                execute: async (data: ProjectJobPayload, _container) => {
                    await pdb.scanProject(data.projectId, false, data.size, data.mtime)
                },
            }
        case "remove":
            if (!data.entity) {
                console.warn("can't create 'project-remove' job without entity")
                return undefined
            }
            return {
                type: "project-remove",
                data: data.entity?.id,
                callback,
                execute: async (data: number, _container) => {
                    await pdb.removeProject(data)
                },
            }
        case "mark-missing":
            return undefined
        // return {
        //     type: "project-mark-missing",
        //     data: data.entity?.id,
        //     merge: "first",
        //     callback,
        //     execute: async (data: number, _container) => {
        //         await pdb.updateMissingOn(data, null)
        //         console.log("missing", data)
        //     },
        // }
        default:
            return undefined
    }
}
