import type { ProjectId } from "../contracts"

export interface ScriptDependencyStatus {
    dependencies: Record<string, string>
    revision: string | null
    lockFingerprint: string | null
    installed: boolean
}

export interface DependencyDeclaration {
    path: string
    content: string
}

export interface DependencyDeclarations {
    revision: string
    files: DependencyDeclaration[]
    truncated: boolean
}

export interface LifecycleApproval {
    lockFingerprint: string
    packages: string[]
}

export type InstallPhase =
    | "preparing"
    | "installing"
    | "lifecycleScripts"
    | "verifying"
    | "complete"
    | "cancelled"
    | "failed"

export interface InstallProgress {
    operationId: string
    phase: InstallPhase
    message?: string
}

interface InstallRequest {
    projectId: ProjectId
    operationId: string
    expectedPackageState: { revision: string | null }
}

export interface PackageCommands {
    status(projectId: ProjectId): Promise<ScriptDependencyStatus>
    declarations(projectId: ProjectId, revision: string): Promise<DependencyDeclarations>
    set(
        request: InstallRequest & { dependencies: Record<string, string> },
        onProgress: (progress: InstallProgress) => void,
    ): Promise<ScriptDependencyStatus>
    restore(
        request: InstallRequest & { lifecycleApproval?: LifecycleApproval },
        onProgress: (progress: InstallProgress) => void,
    ): Promise<ScriptDependencyStatus>
    cancel(projectId: ProjectId, operationId: string): Promise<boolean>
}

export function createPackageCommands(
    invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>,
    createChannel: (onProgress: (progress: InstallProgress) => void) => unknown,
): PackageCommands {
    return {
        status: (projectId) => invoke("get_script_dependencies", { projectId }),
        declarations: (projectId, expectedPackageRevision) =>
            invoke("get_script_dependency_declarations", { projectId, expectedPackageRevision }),
        set: (request, onProgress) =>
            invoke("set_script_dependencies", { ...request, progress: createChannel(onProgress) }),
        restore: (request, onProgress) =>
            invoke("restore_script_dependencies", {
                ...request,
                progress: createChannel(onProgress),
            }),
        cancel: (projectId, operationId) =>
            invoke("cancel_script_dependency_install", { projectId, operationId }),
    }
}
