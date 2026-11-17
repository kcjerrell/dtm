import type {
    ProjectId,
    RunId,
    RunIdentity,
    RunRequest,
    ScriptDiagnostic,
    ScriptRunEvent,
    SelectedInput,
} from "../script/contracts"
import type { InstallProgress, ScriptDependencyStatus } from "../script/packages/adapters"
import type { StoredProject } from "../script/project/adapters"
import { emit } from "./tauri-event"

const PROJECTS_KEY = "dtm.mock.image-scripts.projects.v1"
const PACKAGES_KEY = "dtm.mock.image-scripts.packages.v1"
let install: { projectId: ProjectId; operationId: string; cancelled: boolean } | undefined
const TRUSTED = new Map<ProjectId, { source: string; packageRevision: string | null }>()
const selections = new Set<string>()
const previews = new Map<string, string>()
let active: RunIdentity | undefined

const DEFAULT_SOURCE = "createImageProcess(async (dtm) => {\n    // Start creating here.\n});\n"
const SAMPLE_SOURCE =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
const sampleImageUrl = () => new URL("check_light.png", window.location.href).href

function projects(): StoredProject[] {
    const stored = window.localStorage.getItem(PROJECTS_KEY)
    return stored ? (JSON.parse(stored) as StoredProject[]) : []
}

function persist(projects: StoredProject[]) {
    window.localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
}

function requireProject(items: StoredProject[], id: ProjectId): StoredProject {
    const project = items.find(({ manifest }) => manifest.projectId === id)
    if (!project) throw new Error("Script project not found")
    return project
}

function allDependencies(): Record<string, ScriptDependencyStatus> {
    return JSON.parse(window.localStorage.getItem(PACKAGES_KEY) ?? "{}")
}

function dependencyStatus(id: ProjectId): ScriptDependencyStatus {
    return (
        allDependencies()[id] ?? {
            dependencies: {},
            revision: null,
            lockFingerprint: null,
            installed: false,
        }
    )
}

async function changeDependencies(id: ProjectId, args: Record<string, unknown>, restore: boolean) {
    const status = dependencyStatus(id)
    const expected = args.expectedPackageState as { revision: string | null } | undefined
    if (expected && expected.revision !== status.revision)
        throw new Error("The package environment changed. Review it and try again.")
    if (install || active?.projectId === id) throw new Error("Another script operation is active.")
    if (restore && status.revision === null) throw new Error("This project has no locked packages.")
    const dependencies = restore
        ? status.dependencies
        : (args.dependencies as Record<string, string>)
    const lifecycleApproval = args.lifecycleApproval as { lockFingerprint: string } | undefined
    if (lifecycleApproval && lifecycleApproval.lockFingerprint !== status.lockFingerprint)
        throw new Error("The package lock changed before lifecycle script approval.")
    const operationId = String(args.operationId)
    const channel = args.progress as { onmessage(message: InstallProgress): void }
    const report = (phase: InstallProgress["phase"]) => channel.onmessage({ operationId, phase })
    const job = { projectId: id, operationId, cancelled: false }
    install = job
    try {
        report("preparing")
        await Promise.resolve()
        report("installing")
        await Promise.resolve()
        if (job.cancelled) {
            report("cancelled")
            throw new Error("script package installation cancelled")
        }
        if (lifecycleApproval) report("lifecycleScripts")
        report("verifying")
        const installed = Object.keys(dependencies).length > 0
        const result = {
            dependencies,
            installed,
            revision: installed ? token() : null,
            lockFingerprint: installed ? (restore ? status.lockFingerprint : token()) : null,
        }
        window.localStorage.setItem(
            PACKAGES_KEY,
            JSON.stringify({ ...allDependencies(), [id]: result }),
        )
        TRUSTED.delete(id)
        report("complete")
        return result
    } finally {
        install = undefined
    }
}

function token(): string {
    return (crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", "")
}

function event(payload: ScriptRunEvent) {
    void emit("script-run-event", payload)
}

function cancel(reason: "superseded" | "user") {
    if (!active) return
    const identity = active
    active = undefined
    event({ type: "cancelled", identity, reason })
}

function selection(inputId: string, type: SelectedInput["type"]): SelectedInput {
    const approval = token()
    selections.add(approval)
    return type === "localFile"
        ? { type, inputId, displayName: "Example image.png", selectionToken: approval }
        : { type, inputId, displayName: "Draw Things example", resourceId: approval }
}

function run(request: RunRequest): RunIdentity {
    const id = request.projectId
    const project = requireProject(projects(), id)
    if (install?.projectId === id) throw new Error("Script packages are being installed.")
    const trust = TRUSTED.get(id)
    if (
        trust?.source !== project.source ||
        trust.packageRevision !== dependencyStatus(id).revision
    ) {
        TRUSTED.delete(id)
        throw new Error("script project is untrusted")
    }
    if (project.source !== request.source.source) throw new Error("Save this script before running")
    const identity: RunIdentity = {
        projectId: id,
        clientRequestId: request.clientRequestId,
        runId: crypto.randomUUID() as RunId,
        sourceRevision: request.source.sourceRevision,
        valueRevision: request.valueRevision,
        inputRevision: request.inputRevision,
    }
    event({ type: "queued", identity })
    if (
        request.inputs.some(
            (input) =>
                !selections.has(
                    input.type === "localFile" ? input.selectionToken : input.resourceId,
                ),
        )
    ) {
        fail(identity, { source: "runner", severity: "error", message: "Image selection expired." })
        throw new Error("Image selection expired")
    }
    cancel("superseded")
    active = identity
    event({ type: "started", identity, startedAt: new Date().toISOString() })
    event({ type: "log", identity, stream: "stdout", message: "Mock script started.\n" })
    // Mock execution never evaluates editor source in the webview. These are
    // deterministic scenarios for exercising failure and cancellation.
    if (/\bnew\s+Promise\b|\bBun\.sleep\s*\(/.test(project.source)) return identity
    queueMicrotask(() => {
        if (active !== identity) return
        active = undefined
        const failure = /\bthrow\s+(?:new\s+Error\(\s*["']([^"']+)["'])?/.exec(project.source)
        if (failure) {
            const offset = failure.index
            const lines = project.source.slice(0, offset).split(/\r\n|\r|\n/)
            const line = lines.length
            const column = (lines.at(-1)?.length ?? 0) + 1
            fail(identity, {
                source: "userRuntime",
                severity: "error",
                message: failure[1] ?? "Mock script failed.",
                location: {
                    file: `file:///dtm/projects/${encodeURIComponent(id)}/process.ts`,
                    range: {
                        start: { line, column, offset },
                        end: { line, column: column + 5, offset: offset + 5 },
                    },
                },
            })
            return
        }
        const url = `dtm://script-output/${token()}`
        previews.set(url, request.inputs.length ? sampleImageUrl() : SAMPLE_SOURCE)
        if (previews.size > 16) {
            const oldest = previews.keys().next().value
            if (oldest) previews.delete(oldest)
        }
        event({
            type: "succeeded",
            identity,
            output: { previewUrl: url, mediaType: "image/png", byteLength: 68 },
        })
    })
    return identity
}

function fail(identity: RunIdentity, diagnostic: ScriptDiagnostic) {
    event({ type: "diagnostic", identity, diagnostic })
    event({ type: "failed", identity, diagnostic })
}

export function resolveMockScriptPreview(url: string): string {
    return previews.get(url) ?? ""
}

export function invokeScriptCommand(command: string, args: Record<string, unknown> = {}) {
    const id = args.projectId as ProjectId
    switch (command) {
        case "list_script_projects":
            return { value: projects().map(({ manifest }) => manifest) }
        case "create_script_project": {
            const items = projects()
            const project: StoredProject = {
                manifest: {
                    schemaVersion: 1,
                    projectId: crypto.randomUUID() as ProjectId,
                    displayName: String(args.displayName),
                    entryFile: "process.ts",
                },
                source: DEFAULT_SOURCE,
            }
            persist([...items, project])
            return { value: project }
        }
        case "open_script_project":
            return { value: requireProject(projects(), id) }
        case "rename_script_project": {
            const items = projects()
            const project = requireProject(items, id)
            project.manifest.displayName = String(args.displayName)
            persist(items)
            return { value: project.manifest }
        }
        case "save_trusted_script_project": {
            const items = projects()
            const project = requireProject(items, id)
            const approval = TRUSTED.get(id)
            if (approval?.source === project.source) approval.source = String(args.source)
            else TRUSTED.delete(id)
            project.source = String(args.source)
            persist(items)
            return { value: args.sourceRevision }
        }
        case "get_script_dependencies":
            requireProject(projects(), id)
            return { value: dependencyStatus(id) }
        case "get_script_dependency_declarations": {
            const status = dependencyStatus(id)
            if (args.expectedPackageRevision !== status.revision || !status.installed)
                throw new Error("Installed packages changed before loading declarations.")
            const files =
                Object.hasOwn(status.dependencies, "is-number") ||
                Object.hasOwn(status.dependencies, "@types/is-number")
                    ? [
                          {
                              path: "node_modules/@types/is-number/index.d.ts",
                              content:
                                  "declare function isNumber(value: unknown): boolean; export = isNumber;",
                          },
                      ]
                    : []
            return { value: { revision: status.revision, files, truncated: false } }
        }
        case "set_script_dependencies":
        case "restore_script_dependencies":
            requireProject(projects(), id)
            return {
                value: changeDependencies(id, args, command === "restore_script_dependencies"),
            }
        case "cancel_script_dependency_install": {
            if (
                !install ||
                install.projectId !== id ||
                install.operationId !== args.operationId ||
                install.cancelled
            )
                return { value: false }
            install.cancelled = true
            return { value: true }
        }
        case "trust_script_project": {
            const { source } = requireProject(projects(), id)
            if (install?.projectId === id) throw new Error("Script packages are being installed.")
            const packageRevision = dependencyStatus(id).revision
            if (
                args.expectedSource !== source ||
                (args.expectedPackageRevision ?? null) !== packageRevision
            )
                throw new Error("Saved script or package revision changed before approval")
            TRUSTED.set(id, { source, packageRevision })
            return { value: undefined }
        }
        case "revoke_script_project_trust":
            TRUSTED.delete(id)
            if (active?.projectId === id) cancel("user")
            return { value: undefined }
        case "pick_script_input":
            return { value: selection(String(args.inputId), "localFile") }
        case "select_script_draw_things_input":
            if (args.imageId !== 1) throw new Error("Draw Things image unavailable")
            return { value: selection(String(args.inputId), "drawThings") }
        case "dtp_list_images":
            return { value: { images: [{ id: 1, prompt: "Draw Things example" }], total: 1 } }
        case "revoke_script_input":
            selections.delete(String(args.selectionToken))
            return { value: undefined }
        case "run_script":
            return { value: run(args.request as RunRequest) }
        case "cancel_script":
            cancel("user")
            return { value: undefined }
        default:
            return null
    }
}
