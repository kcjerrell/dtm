import type * as Monaco from "monaco-editor/editor/editor.api.js"
import type { ProjectId } from "../contracts"

export interface ProjectSession {
    schemaVersion: 1
    lastProjectId: ProjectId | null
    views: Record<string, Monaco.editor.ICodeEditorViewState>
}
export interface ProjectSessionStorage {
    load(): ProjectSession | null
    save(session: ProjectSession): void
}

const KEY = "dtm.image-scripts.editor.v1"
const MAX_SESSION_CHARACTERS = 512 * 1024

function object(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}
function position(value: unknown): boolean {
    return (
        object(value) &&
        Number.isInteger(value.lineNumber) &&
        Number(value.lineNumber) > 0 &&
        Number.isInteger(value.column) &&
        Number(value.column) > 0
    )
}
function viewState(value: unknown): value is Monaco.editor.ICodeEditorViewState {
    return (
        object(value) &&
        Array.isArray(value.cursorState) &&
        value.cursorState.length <= 1000 &&
        value.cursorState.every(
            (cursor: unknown) =>
                object(cursor) &&
                typeof cursor.inSelectionMode === "boolean" &&
                position(cursor.position) &&
                position(cursor.selectionStart),
        ) &&
        object(value.viewState) &&
        position(value.viewState.firstPosition) &&
        typeof value.viewState.scrollLeft === "number" &&
        Number.isFinite(value.viewState.scrollLeft) &&
        typeof value.viewState.firstPositionDeltaTop === "number" &&
        Number.isFinite(value.viewState.firstPositionDeltaTop) &&
        object(value.contributionsState)
    )
}

/** Stores only local navigation/view metadata, never source, selections or trust. */
export function createLocalProjectSessionStorage(
    storage: Pick<Storage, "getItem" | "setItem">,
): ProjectSessionStorage {
    return {
        load() {
            const text = storage.getItem(KEY)
            if (!text || text.length > MAX_SESSION_CHARACTERS) return null
            let value: unknown
            try {
                value = JSON.parse(text)
            } catch {
                return null
            }
            if (
                !object(value) ||
                value.schemaVersion !== 1 ||
                !(value.lastProjectId === null || typeof value.lastProjectId === "string") ||
                !object(value.views)
            )
                return null
            const views: ProjectSession["views"] = {}
            for (const [id, view] of Object.entries(value.views).slice(-64)) {
                if (viewState(view))
                    Object.defineProperty(views, id, {
                        value: view,
                        enumerable: true,
                        configurable: true,
                        writable: true,
                    })
            }
            return {
                schemaVersion: 1,
                lastProjectId: value.lastProjectId as ProjectId | null,
                views,
            }
        },
        save(session) {
            const text = JSON.stringify(session)
            if (text.length > MAX_SESSION_CHARACTERS)
                throw new Error("Editor session exceeds storage limit")
            storage.setItem(KEY, text)
        },
    }
}
