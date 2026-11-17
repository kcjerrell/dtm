import type * as Monaco from "monaco-editor/editor/editor.api.js"
import type { DependencyDeclaration } from "../packages/adapters"

export interface PackageDeclarationAdapter {
    replace(entry: string, files: readonly DependencyDeclaration[]): void
    clear(): void
}

export function createMonacoPackageDeclarations(defaults: {
    addExtraLib(content: string, filePath: string): Monaco.IDisposable
}): PackageDeclarationAdapter {
    let registrations: Monaco.IDisposable[] = []
    const clear = () => {
        for (const registration of registrations) registration.dispose()
        registrations = []
    }
    return {
        replace(entry, files) {
            clear()
            const root = entry.slice(0, entry.lastIndexOf("/") + 1)
            try {
                for (const { path, content } of files) {
                    if (
                        !path.startsWith("node_modules/") ||
                        path.includes("\\") ||
                        path.split("/").some((part) => !part || part === "." || part === "..")
                    )
                        throw new Error("The package declaration path is invalid.")
                    registrations.push(defaults.addExtraLib(content, root + path))
                }
            } catch (error) {
                clear()
                throw error
            }
        },
        clear,
    }
}
