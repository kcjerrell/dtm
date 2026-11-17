import { proxy } from "valtio/vanilla"
import type { ProjectId } from "../contracts"
import type { PackageDeclarationAdapter } from "../editor/packageDeclarations"
import { redactLocalPaths } from "../run/presentation"
import type {
    InstallPhase,
    InstallProgress,
    LifecycleApproval,
    PackageCommands,
    ScriptDependencyStatus,
} from "./adapters"

interface Project {
    id: ProjectId
    entry: string
}

interface Operation {
    projectId: ProjectId
    operationId: string
    phase: InstallPhase
    messages: string
    cancelling: boolean
}

type OperationRequest =
    | { type: "set"; dependencies: Record<string, string> }
    | { type: "restore"; lifecycleApproval?: LifecycleApproval }

const describeError = (error: unknown) =>
    redactLocalPaths(error instanceof Error ? error.message : String(error)).slice(0, 8192)

export class ScriptPackageController {
    readonly state = proxy({
        status: null as ScriptDependencyStatus | null,
        loading: false,
        statusError: null as string | null,
        operation: null as Operation | null,
        operationError: null as string | null,
        cancelled: false,
        loadingTypes: false,
        declarationError: null as string | null,
        declarationTruncated: false,
    })
    #active?: Project
    #readGeneration = 0

    constructor(
        private readonly options: {
            commands: PackageCommands
            declarations: PackageDeclarationAdapter
            canChange(projectId: ProjectId): boolean
            onStart(projectId: ProjectId): void
            onRevisionChange(projectId: ProjectId): void
        },
    ) {}

    activate(id: ProjectId, entry: string): void {
        this.#active = { id, entry }
        this.#readGeneration++
        this.state.status = null
        this.state.loading = false
        this.state.statusError = null
        this.state.operationError = null
        this.state.cancelled = false
        this.#clearTypes()
        void this.refresh()
    }

    /** undefined for unavailable status and null for a reviewed dependency-free project. */
    readyRevision(projectId: ProjectId): string | null | undefined {
        const { status, loading, statusError, operation } = this.state
        if (
            this.#active?.id !== projectId ||
            !status ||
            loading ||
            statusError ||
            operation?.projectId === projectId ||
            (status.revision !== null && !status.installed)
        )
            return undefined
        return status.revision
    }

    async refresh(): Promise<void> {
        const project = this.#active
        if (!project || this.state.operation?.projectId === project.id) return
        const generation = ++this.#readGeneration
        this.state.loading = true
        this.state.statusError = null
        this.#clearTypes()
        try {
            const status = await this.options.commands.status(project.id)
            if (generation === this.#readGeneration) this.#applyStatus(project, status, generation)
        } catch (error) {
            if (generation !== this.#readGeneration) return
            if (this.state.status) this.options.onRevisionChange(project.id)
            this.state.status = null
            this.state.statusError = describeError(error)
        } finally {
            if (generation === this.#readGeneration) this.state.loading = false
        }
    }

    set(
        projectId: ProjectId,
        revision: string | null,
        dependencies: Record<string, string>,
    ): Promise<boolean> {
        return this.#change(projectId, revision, { type: "set", dependencies })
    }

    restore(
        projectId: ProjectId,
        revision: string,
        lifecycleApproval?: LifecycleApproval,
    ): Promise<boolean> {
        return this.#change(projectId, revision, { type: "restore", lifecycleApproval })
    }

    async #change(
        projectId: ProjectId,
        revision: string | null,
        request: OperationRequest,
    ): Promise<boolean> {
        if (
            this.#active?.id !== projectId ||
            this.state.loading ||
            this.state.loadingTypes ||
            this.state.operation ||
            this.state.status?.revision !== revision ||
            !this.options.canChange(projectId)
        )
            return false
        const operationId = crypto.randomUUID()
        this.state.operationError = null
        this.state.cancelled = false
        this.state.operation = {
            projectId,
            operationId,
            phase: "preparing",
            messages: "",
            cancelling: false,
        }
        this.options.onStart(projectId)
        const onProgress = ({ operationId: id, phase, message }: InstallProgress) => {
            const operation = this.state.operation
            if (id !== operationId || operation?.operationId !== id) return
            operation.phase = phase
            if (message)
                operation.messages = (operation.messages + describeError(message)).slice(-8192)
        }
        const args = {
            projectId,
            operationId,
            expectedPackageState: { revision },
        }
        let completed = false
        try {
            const status =
                request.type === "set"
                    ? await this.options.commands.set(
                          { ...args, dependencies: request.dependencies },
                          onProgress,
                      )
                    : await this.options.commands.restore(
                          { ...args, lifecycleApproval: request.lifecycleApproval },
                          onProgress,
                      )
            completed = true
            const active = this.#active
            if (active?.id === projectId) {
                const generation = ++this.#readGeneration
                this.#clearTypes()
                this.#applyStatus(active, status, generation)
            }
            return true
        } catch (error) {
            if (this.#active?.id === projectId) {
                const cancelled =
                    this.state.operation?.phase === "cancelled" ||
                    String(error).includes("script package installation cancelled")
                this.state.cancelled = cancelled
                this.state.operationError = cancelled ? null : describeError(error)
            }
            return false
        } finally {
            const operation = this.state.operation
            if (operation?.operationId === operationId) {
                this.state.operation = null
                // A failure can mean the active revision changed in another window or the
                // command response was lost. Re-read it before allowing future actions.
                if (this.#active?.id === projectId && !completed) void this.refresh()
            }
        }
    }

    async cancel(): Promise<void> {
        const operation = this.state.operation
        if (!operation || operation.cancelling) return
        operation.cancelling = true
        try {
            const accepted = await this.options.commands.cancel(
                operation.projectId,
                operation.operationId,
            )
            if (!accepted && this.state.operation === operation) operation.cancelling = false
        } catch (error) {
            if (this.state.operation !== operation) return
            operation.cancelling = false
            this.state.operationError = describeError(error)
        }
    }

    #applyStatus(project: Project, status: ScriptDependencyStatus, generation: number): void {
        const previous = this.state.status
        if (
            previous &&
            (previous.revision !== status.revision || previous.installed !== status.installed)
        )
            this.options.onRevisionChange(project.id)
        this.state.status = status
        if (status.revision !== null && status.installed)
            void this.#loadTypes(project, status.revision, generation)
    }

    async #loadTypes(project: Project, revision: string, generation: number): Promise<void> {
        this.state.loadingTypes = true
        try {
            const result = await this.options.commands.declarations(project.id, revision)
            if (generation !== this.#readGeneration) return
            if (result.revision !== revision)
                throw new Error("Installed packages changed while loading editor declarations.")
            this.options.declarations.replace(project.entry, result.files)
            this.state.declarationTruncated = result.truncated
        } catch (error) {
            if (generation !== this.#readGeneration) return
            this.options.declarations.clear()
            this.state.declarationError = describeError(error)
        } finally {
            if (generation === this.#readGeneration) this.state.loadingTypes = false
        }
    }

    #clearTypes(): void {
        this.options.declarations.clear()
        this.state.loadingTypes = false
        this.state.declarationError = null
        this.state.declarationTruncated = false
    }

    dispose(): void {
        this.#active = undefined
        this.#readGeneration++
        this.#clearTypes()
    }
}
