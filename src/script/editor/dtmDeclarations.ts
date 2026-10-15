import type * as Monaco from "monaco-editor/editor/editor.api.js"

export const DTM_DECLARATION_URI = "file:///dtm/dtm-api.d.ts"

export const DTM_DECLARATION = `
interface DtmImageInput {
    readonly path: string
    readonly mediaType: string
}

interface DtmInputOptions {
    id?: string
    label?: string
    required?: boolean
}

interface DtmParamOptions {
    id?: string
    label?: string
    min?: number
    max?: number
    step?: number
}

interface DtmContext {
    input(options?: DtmInputOptions): Promise<DtmImageInput>
    param(defaultValue: number, options?: DtmParamOptions): number
    param(defaultValue: number, min: number, max: number, step?: number): number
    param(defaultValue: boolean, options?: Pick<DtmParamOptions, "id" | "label">): boolean
    param(defaultValue: string, options?: Pick<DtmParamOptions, "id" | "label">): string
}

type DtmImageResult = DtmImageInput | Uint8Array | string

declare function createImageProcess(
    process: (dtm: DtmContext) => DtmImageResult | Promise<DtmImageResult>,
): void
`

/** Register the replaceable virtual library owned by one editor lifecycle. */
export function registerDtmDeclarations(typescriptDefaults: {
    addExtraLib(content: string, filePath?: string): Monaco.IDisposable
}): Monaco.IDisposable {
    return typescriptDefaults.addExtraLib(DTM_DECLARATION, DTM_DECLARATION_URI)
}
