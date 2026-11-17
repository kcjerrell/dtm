import { TypeScriptWorker } from "monaco-editor/languages/features/typescript/tsWorker.js"
import { expect, it } from "vitest"
import { DTM_DECLARATION, DTM_DECLARATION_URI } from "./dtmDeclarations"
import { createMonacoPackageDeclarations } from "./packageDeclarations"

it("resolves installed package exports and relative declarations in Monaco, then releases them", async () => {
    const entry = "file:///dtm/projects/test/process.ts"
    const source = `import { parse } from "widget/colors";
        const wrong: number = parse();
        createImageProcess(() => new Uint8Array());`
    const extraLibs = {
        [DTM_DECLARATION_URI]: { content: DTM_DECLARATION, version: 1 },
    } as Record<string, { content: string; version: number }>
    let version = 1
    const declarations = createMonacoPackageDeclarations({
        addExtraLib(content, filePath) {
            extraLibs[filePath] = { content, version: ++version }
            return {
                dispose: () => {
                    delete extraLibs[filePath]
                },
            }
        },
    })
    const worker = new TypeScriptWorker(
        {
            getMirrorModels: () => [
                {
                    uri: { path: "/dtm/projects/test/process.ts", toString: () => entry },
                    version: 1,
                    getValue: () => source,
                },
            ],
        },
        {
            compilerOptions: {
                allowNonTsExtensions: true,
                module: 99,
                moduleResolution: 100,
                noEmit: true,
                strict: true,
                target: 99,
            },
            extraLibs: { ...extraLibs },
            inlayHintsOptions: {},
        },
    )
    const diagnostics = async () =>
        (await worker.getSemanticDiagnostics(entry)).map(({ code }) => code)
    expect(await diagnostics()).toEqual([2307])
    declarations.replace(entry, [
        {
            path: "node_modules/widget/package.json",
            content: JSON.stringify({ exports: { "./colors": { types: "./dist/colors.d.mts" } } }),
        },
        {
            path: "node_modules/widget/dist/colors.d.mts",
            content:
                'import type { Value } from "./with space.js"; export function parse(): Value;',
        },
        {
            path: "node_modules/widget/dist/with space.d.ts",
            content: "export type Value = string;",
        },
    ])
    await worker.updateExtraLibs({ ...extraLibs })
    expect(await diagnostics()).toEqual([2322])
    declarations.clear()
    await worker.updateExtraLibs({ ...extraLibs })
    expect(Object.keys(extraLibs)).toEqual([DTM_DECLARATION_URI])
    expect(await diagnostics()).toEqual([2307])
})
