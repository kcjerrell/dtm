import { proxy } from "valtio/vanilla"
import type { ProjectId, ProjectManifest, SourceRevision } from "../contracts"
import type { ScriptProjectModel } from "../editor/modelRegistry"
import type { ProjectCommands, ProjectEditor, ProjectModels, StoredProject } from "./adapters"
import type { ProjectSession, ProjectSessionStorage } from "./session"

export interface ProjectDocumentState {
    revision: SourceRevision
    savedRevision: SourceRevision
    dirty: boolean
    status: "saved" | "dirty" | "saving" | "save-error"
    error: string | null
}
export interface ProjectControllerState {
    projects: ProjectManifest[]
    currentProjectId: ProjectId | null
    documents: Record<string, ProjectDocumentState>
    loading: boolean
    error: string | null
    sessionError: string | null
}
interface Document {
    handle: ScriptProjectModel
    subscription: { dispose(): void }
    timer?: ReturnType<typeof setTimeout>
    saving?: Promise<void>
}
export interface ProjectControllerOptions {
    commands: ProjectCommands
    models: ProjectModels
    editor: ProjectEditor
    session: ProjectSessionStorage
    autosaveDelay?: number
}

/** Renderable state is a Valtio proxy. Source, models, timers and pending operations
 * stay outside it. No executor or run adapter is part of this controller. */
export class ScriptProjectController {
    readonly state = proxy<ProjectControllerState>({
        projects: [],
        currentProjectId: null,
        documents: {},
        loading: false,
        error: null,
        sessionError: null,
    })
    readonly #documents = new Map<ProjectId, Document>()
    readonly #renames = new Map<ProjectId, Promise<void>>()
    readonly #viewSubscription: { dispose(): void }
    #session: ProjectSession = { schemaVersion: 1, lastProjectId: null, views: {} }
    #viewTimer?: ReturnType<typeof setTimeout>
    #generation = 0
    #closing = false
    #disposed = false
    #initialization?: Promise<void>

    constructor(private readonly options: ProjectControllerOptions) {
        if (!Number.isFinite(options.autosaveDelay ?? 300) || (options.autosaveDelay ?? 300) < 0) {
            throw new Error("Autosave delay must be nonnegative and finite")
        }
        this.#viewSubscription = options.editor.onDidChangeViewState(() => {
            if (this.#closing || this.#disposed) return
            clearTimeout(this.#viewTimer)
            this.#viewTimer = setTimeout(() => this.rememberViewState(), 250)
        })
    }

    initialize(): Promise<void> {
        this.#assertActive()
        this.#initialization ??= this.#initialize().catch((error) => {
            this.#initialization = undefined
            throw error
        })
        return this.#initialization
    }

    async #initialize(): Promise<void> {
        try {
            this.#session = this.options.session.load() ?? this.#session
        } catch (error) {
            this.state.sessionError = message(error)
        }
        const generation = this.#generation
        this.state.loading = true
        this.state.error = null
        try {
            const projects = await this.options.commands.list()
            if (this.#disposed || this.#closing) return
            const merged = new Map(projects.map((project) => [project.projectId, project]))
            for (const project of this.state.projects) merged.set(project.projectId, project)
            this.state.projects = [...merged.values()]
            const last = this.#session.lastProjectId
            // A user selection while list() was pending takes precedence over restore.
            if (
                generation === this.#generation &&
                last &&
                projects.some((p) => p.projectId === last)
            ) {
                await this.open(last)
            }
        } catch (error) {
            if (generation === this.#generation) this.state.error = message(error)
            throw error
        } finally {
            if (generation === this.#generation) this.state.loading = false
        }
    }

    async open(projectId: ProjectId): Promise<void> {
        return this.#navigate(async () => {
            const existing = this.#documents.get(projectId)
            if (existing) return existing.handle
            const project = await this.options.commands.open(projectId)
            this.#assertActive()
            if (project.manifest.projectId !== projectId)
                throw new Error("Opened project ID mismatch")
            return this.#document(project)
        })
    }

    async create(displayName: string): Promise<void> {
        return this.#navigate(async () => {
            const project = await this.options.commands.create(displayName)
            this.#assertActive()
            return this.#document(project)
        })
    }

    async #navigate(load: () => Promise<ScriptProjectModel>): Promise<void> {
        this.#assertActive()
        const generation = ++this.#generation
        this.state.loading = true
        this.state.error = null
        try {
            const current = this.state.currentProjectId
            if (current) await this.flush(current)
            if (generation !== this.#generation || this.#closing || this.#disposed) return
            const handle = await load()
            if (generation !== this.#generation || this.#closing || this.#disposed) return
            this.rememberViewState()
            const id = this.#idFor(handle)
            this.state.currentProjectId = id
            this.options.editor.activate(handle, this.#session.views[id])
            this.#session.lastProjectId = id
            this.#persistSession()
        } catch (error) {
            if (generation === this.#generation) this.state.error = message(error)
            throw error
        } finally {
            if (generation === this.#generation) this.state.loading = false
        }
    }

    #document(project: StoredProject): ScriptProjectModel {
        const id = project.manifest.projectId
        this.#upsert(project.manifest)
        const existing = this.#documents.get(id)
        if (existing) return existing.handle
        const handle = this.options.models.open(project)
        this.state.documents[id] = {
            revision: handle.revision,
            savedRevision: handle.revision,
            dirty: handle.dirty,
            status: handle.dirty ? "dirty" : "saved",
            error: null,
        }
        const document: Document = {
            handle,
            subscription: handle.onDidChangeRevision(({ revision, dirty }) => {
                const state = this.state.documents[id]
                state.revision = revision
                state.dirty = dirty
                state.error = null
                state.status = document.saving ? "saving" : "dirty"
                clearTimeout(document.timer)
                document.timer = setTimeout(() => {
                    void this.flush(id).catch(() => {})
                }, this.options.autosaveDelay ?? 300)
            }),
        }
        this.#documents.set(id, document)
        return handle
    }

    /** Per-project writes are serialized. Each call snapshots source and revision
     * together; a stale acknowledgement never marks a newer model clean. */
    async flush(projectId = this.state.currentProjectId): Promise<void> {
        if (!projectId) return
        const document = this.#documents.get(projectId)
        if (!document) return
        clearTimeout(document.timer)
        while (document.handle.dirty) {
            if (document.saving) {
                await document.saving
                continue
            }
            const revision = document.handle.revision
            const source = document.handle.model.getValue()
            const state = this.state.documents[projectId]
            state.status = "saving"
            state.error = null
            const saving = Promise.resolve().then(async () => {
                try {
                    const acknowledgement = await this.options.commands.save(
                        projectId,
                        source,
                        revision,
                    )
                    if (acknowledgement !== revision)
                        throw new Error("Save acknowledgement revision mismatch")
                    state.savedRevision = revision
                    document.handle.markSaved(revision)
                    state.dirty = document.handle.dirty
                    state.status = state.dirty ? "dirty" : "saved"
                } catch (error) {
                    state.dirty = true
                    state.status = "save-error"
                    state.error = message(error)
                    throw error
                } finally {
                    document.saving = undefined
                }
            })
            document.saving = saving
            await saving
        }
    }

    rename(projectId: ProjectId, displayName: string): Promise<void> {
        this.#assertActive()
        const previous = this.#renames.get(projectId) ?? Promise.resolve()
        const task = previous
            .catch(() => {})
            .then(async () => {
                const manifest = await this.options.commands.rename(projectId, displayName)
                if (manifest.projectId !== projectId) throw new Error("Renamed project ID mismatch")
                if (!this.#disposed) {
                    this.#upsert(manifest)
                    this.state.error = null
                }
            })
            .catch((error) => {
                if (!this.#disposed) this.state.error = message(error)
                throw error
            })
            .finally(() => {
                if (this.#renames.get(projectId) === task) this.#renames.delete(projectId)
            })
        this.#renames.set(projectId, task)
        return task
    }

    rememberViewState(): void {
        if (this.#disposed) return
        clearTimeout(this.#viewTimer)
        const id = this.state.currentProjectId
        const view = this.options.editor.saveViewState()
        if (id && view) {
            // Keep only the most recently visited views; project source is never copied here.
            delete this.#session.views[id]
            Object.defineProperty(this.#session.views, id, {
                value: view,
                enumerable: true,
                configurable: true,
                writable: true,
            })
            const keys = Object.keys(this.#session.views)
            for (const key of keys.slice(0, Math.max(0, keys.length - 64)))
                delete this.#session.views[key]
        }
        this.#persistSession()
    }

    #persistSession(): void {
        try {
            this.options.session.save(this.#session)
            this.state.sessionError = null
        } catch (error) {
            this.state.sessionError = message(error)
        }
    }

    #idFor(handle: ScriptProjectModel): ProjectId {
        for (const [id, document] of this.#documents) if (document.handle === handle) return id
        throw new Error("Editor model is not owned by this controller")
    }
    #upsert(manifest: ProjectManifest): void {
        const index = this.state.projects.findIndex(
            (project) => project.projectId === manifest.projectId,
        )
        if (index < 0) this.state.projects.push(manifest)
        else this.state.projects[index] = manifest
    }
    #assertActive(): void {
        if (this.#disposed || this.#closing)
            throw new Error("Project controller is closing or disposed")
    }

    /** Failed saves leave models and listeners intact, so the caller can retry.
     * The host owns the registry/editor and should await this before teardown. */
    async dispose(): Promise<void> {
        if (this.#disposed) return
        this.#assertActive()
        this.#closing = true
        ++this.#generation
        try {
            await Promise.all([...this.#documents.keys()].map((id) => this.flush(id)))
            await Promise.allSettled(this.#renames.values())
            this.rememberViewState()
            clearTimeout(this.#viewTimer)
            this.#viewSubscription.dispose()
            this.options.editor.clear()
            for (const document of this.#documents.values()) {
                clearTimeout(document.timer)
                document.subscription.dispose()
                document.handle.dispose()
            }
            this.#documents.clear()
            this.state.loading = false
            this.#disposed = true
        } catch (error) {
            this.#closing = false
            this.state.loading = false
            throw error
        }
    }
}
function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
