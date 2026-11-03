import type * as Monaco from "monaco-editor/editor/editor.api.js"

export interface RuntimeInlayHint {
    offset: number
    label: string
}

export function createRuntimeInlayHintProvider(
    monaco: typeof Monaco,
    getHints: () => readonly RuntimeInlayHint[],
    options: {
        model?: Monaco.editor.ITextModel
        onDidChangeInlayHints?: Monaco.IEvent<void>
    } = {},
): Monaco.languages.InlayHintsProvider {
    return {
        displayName: "DTM runtime values",
        onDidChangeInlayHints: options.onDidChangeInlayHints,
        provideInlayHints(model, range) {
            if (options.model && model !== options.model) return { hints: [], dispose() {} }
            const hints = getHints().flatMap((hint) => {
                if (
                    !Number.isInteger(hint.offset) ||
                    hint.offset < 0 ||
                    hint.offset > model.getValueLength()
                )
                    return []
                const position = model.getPositionAt(hint.offset)
                if (!range.containsPosition(position)) return []

                return [
                    {
                        position,
                        label: ` = ${hint.label}`,
                        kind: monaco.languages.InlayHintKind.Parameter,
                    },
                ]
            })

            return { hints, dispose() {} }
        },
    }
}
