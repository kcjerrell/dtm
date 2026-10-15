import type * as Monaco from "monaco-editor/editor/editor.api.js"

export interface RuntimeInlayHint {
    offset: number
    label: string
}

export function createRuntimeInlayHintProvider(
    monaco: typeof Monaco,
    getHints: () => readonly RuntimeInlayHint[],
): Monaco.languages.InlayHintsProvider {
    return {
        displayName: "DTM runtime values",
        provideInlayHints(model, range) {
            const hints = getHints().flatMap((hint) => {
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
