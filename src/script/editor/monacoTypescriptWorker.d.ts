declare module "monaco-editor/languages/features/typescript/tsWorker.js" {
    interface MirrorModel {
        uri: { path: string; toString(skipEncoding?: boolean): string }
        version: number
        getValue(): string
    }

    interface WorkerContext {
        getMirrorModels(): MirrorModel[]
    }

    interface WorkerCreateData {
        compilerOptions: Record<string, unknown>
        extraLibs: Record<string, { content: string; version: number }>
        inlayHintsOptions: Record<string, unknown>
    }

    export class TypeScriptWorker {
        constructor(context: WorkerContext, createData: WorkerCreateData)
        getSemanticDiagnostics(fileName: string): Promise<Array<{ code: number | string }>>
        getCompletionsAtPosition(
            fileName: string,
            position: number,
        ): Promise<{ entries: Array<{ name: string }> } | undefined>
    }
}
