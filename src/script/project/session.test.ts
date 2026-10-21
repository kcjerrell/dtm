import type * as Monaco from "monaco-editor/editor/editor.api.js"
import { expect, it, vi } from "vitest"
import type { ProjectId } from "../contracts"
import { createLocalProjectSessionStorage } from "./session"

const view: Monaco.editor.ICodeEditorViewState = {
    cursorState: [
        {
            inSelectionMode: false,
            selectionStart: { lineNumber: 1, column: 1 },
            position: { lineNumber: 3, column: 4 },
        },
    ],
    viewState: {
        scrollLeft: 0,
        firstPosition: { lineNumber: 3, column: 1 },
        firstPositionDeltaTop: 0,
    },
    contributionsState: {},
}

it("round-trips versioned navigation and view metadata", () => {
    let data: string | null = null
    const storage = createLocalProjectSessionStorage({
        getItem: () => data,
        setItem: (_key, text) => {
            data = text
        },
    })
    expect(storage.load()).toBeNull()
    const session = {
        schemaVersion: 1 as const,
        lastProjectId: "p" as ProjectId,
        views: { p: view },
    }
    storage.save(session)
    expect(storage.load()).toEqual(session)
})

it("ignores malformed/versionless metadata and invalid Monaco views", () => {
    let data = "not JSON"
    const storage = createLocalProjectSessionStorage({ getItem: () => data, setItem: vi.fn() })
    for (const value of [
        "not JSON",
        "null",
        '{"lastProjectId":"p","views":{}}',
        '{"schemaVersion":2,"lastProjectId":"p","views":{}}',
    ]) {
        data = value
        expect(storage.load()).toBeNull()
    }
    data = JSON.stringify({ schemaVersion: 1, lastProjectId: "p", views: { p: {}, valid: view } })
    expect(storage.load()?.views).toEqual({ valid: view })
})

it("bounds session metadata and rejects failed writes", () => {
    const storage = createLocalProjectSessionStorage({
        getItem: () => "x".repeat(600 * 1024),
        setItem: () => {
            throw new Error("quota")
        },
    })
    expect(storage.load()).toBeNull()
    expect(() => storage.save({ schemaVersion: 1, lastProjectId: null, views: {} })).toThrow(
        "quota",
    )
    expect(() =>
        storage.save({
            schemaVersion: 1,
            lastProjectId: "x".repeat(600 * 1024) as ProjectId,
            views: {},
        }),
    ).toThrow("storage limit")
})
