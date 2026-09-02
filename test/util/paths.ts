import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testRoot = path.resolve(__dirname, "..")

function resolveFromTestRoot(envValue: string | undefined, fallback: string): string {
    const value = envValue?.trim() ? envValue : fallback
    return path.isAbsolute(value) ? value : path.resolve(testRoot, value)
}

export function getTestDataPath(...parts: string[]): string {
    return path.join(getTestDataRootDir(), ...parts)
}

export function getTestDataRootDir(): string {
    return resolveFromTestRoot(process.env.TEST_DATA_DIR, "../test_data")
}

export function getAppDataDir(): string {
    if (process.env.DTM_APP_DATA_DIR?.trim()) return path.resolve(process.env.DTM_APP_DATA_DIR)
    if (process.platform === "darwin") {
        return path.join(os.homedir(), "Library", "Application Support", "com.kcjer.dtm")
    }
    if (process.platform === "linux") {
        return path.join(
            process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"),
            "com.kcjer.dtm",
        )
    }
    throw new Error(`Unsupported E2E platform: ${process.platform}`)
}
