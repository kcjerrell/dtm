import type * as Monaco from "monaco-editor/editor/editor.api.js"
import type { ProjectId, ProjectManifest, SourceRevision } from "../contracts"
import type {
    ScriptEditorSession,
    ScriptModelRegistry,
    ScriptProjectModel,
} from "../editor/modelRegistry"

export interface StoredProject {
    manifest: ProjectManifest
    source: string
}

export interface ProjectCommands {
    list(): Promise<ProjectManifest[]>
    create(displayName: string): Promise<StoredProject>
    open(projectId: ProjectId): Promise<StoredProject>
    rename(projectId: ProjectId, displayName: string): Promise<ProjectManifest>
    save(
        projectId: ProjectId,
        source: string,
        sourceRevision: SourceRevision,
    ): Promise<SourceRevision>
}

/** Inject invoke at integration time; importing the controller performs no IPC. */
export function createProjectCommands(
    invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>,
): ProjectCommands {
    return {
        list: () => invoke("list_script_projects"),
        create: (displayName) => invoke("create_script_project", { displayName }),
        open: (projectId) => invoke("open_script_project", { projectId }),
        rename: (projectId, displayName) =>
            invoke("rename_script_project", { projectId, displayName }),
        // S20's service save preserves existing trust; storage-only saves do not.
        save: (projectId, source, sourceRevision) =>
            invoke("save_trusted_script_project", { projectId, source, sourceRevision }),
    }
}

export interface ProjectModels {
    open(project: StoredProject): ScriptProjectModel
}
export interface ProjectEditor {
    activate(project: ScriptProjectModel, viewState?: Monaco.editor.ICodeEditorViewState): void
    saveViewState(): Monaco.editor.ICodeEditorViewState | null
    onDidChangeViewState(listener: () => void): Monaco.IDisposable
    clear(): void
}

/** Reuses S12's model ownership and editor switching, including independent undo stacks. */
export function createProjectEditorBindings(
    registry: ScriptModelRegistry,
    session: ScriptEditorSession,
    uri: Pick<typeof Monaco.Uri, "parse">,
): { models: ProjectModels; editor: ProjectEditor } {
    return {
        models: {
            open: ({ manifest, source }) =>
                registry.open(
                    uri.parse(
                        `file:///dtm/projects/${encodeURIComponent(manifest.projectId)}/process.ts`,
                    ),
                    source,
                ),
        },
        editor: {
            activate(project, viewState) {
                session.switchTo(project)
                if (viewState) session.editor.restoreViewState(viewState)
            },
            saveViewState: () => session.editor.saveViewState(),
            onDidChangeViewState(listener) {
                const scroll = session.editor.onDidScrollChange(listener)
                const cursor = session.editor.onDidChangeCursorPosition(listener)
                return {
                    dispose: () => {
                        scroll.dispose()
                        cursor.dispose()
                    },
                }
            },
            clear: () => session.editor.setModel(null),
        },
    }
}
