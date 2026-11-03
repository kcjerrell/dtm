import type { ScriptDiagnostic } from "../contracts"

/** Logs and backend error strings may contain private native paths. Keep the raw
 * failure backend-side for debugging/mapping, not in routine presentation state. */
export function redactLocalPaths(message: string): string {
    return (
        message
            // biome-ignore lint/suspicious/noControlCharactersInRegex: strip ANSI escape sequences from user process output
            .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
            .replace(/file:\/\/[^\s"'<>]+/gi, "[local path]")
            .replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>]+/g, "[local path]")
            .replace(/(^|[^\w/])\/(?!\/)[^\s"'<>]+/g, "$1[local path]")
    )
}

export function presentDiagnostic(diagnostic: ScriptDiagnostic): ScriptDiagnostic {
    return {
        source: diagnostic.source,
        severity: diagnostic.severity,
        message: redactLocalPaths(diagnostic.message).slice(0, 16_384),
        ...(diagnostic.code ? { code: redactLocalPaths(diagnostic.code).slice(0, 128) } : {}),
        // Runtime source-map translation belongs to integration. A raw instrumented
        // location must never be mistaken for a location in the current editor.
    }
}
