import { readFileSync } from "node:fs"
import { createServer } from "node:net"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const appBinary = resolve(projectRoot, "src-tauri/target/debug/dtm")
const viteUrl = "http://localhost:1420"

function runtimeMode(binaryPath) {
    const binary = readFileSync(binaryPath)
    if (binary.includes(Buffer.from("DTM_TAURI_RUNTIME_MODE=dev\0"))) return "dev"
    if (binary.includes(Buffer.from("DTM_TAURI_RUNTIME_MODE=build\0"))) return "build"

    throw new Error(
        `Cannot determine the Tauri runtime mode for ${binaryPath}. ` +
            "Rebuild it once with either `npm run dev` or `npm run build:debug`.",
    )
}

function isPortOpen(port) {
    return new Promise((resolvePort) => {
        const socket = createServer()
        socket.once("error", () => resolvePort(true))
        socket.once("listening", () => socket.close(() => resolvePort(false)))
        socket.listen(port, "127.0.0.1")
    })
}

async function waitForVite(process) {
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
        if (process.exitCode !== null) {
            throw new Error(`Vite exited before it became ready (exit code ${process.exitCode}).`)
        }
        try {
            const response = await fetch(viteUrl)
            if (response.ok) return
        } catch {
            // Vite has not finished listening yet.
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
    }
    throw new Error(`Vite did not become ready at ${viteUrl} within 30 seconds.`)
}

function run(command, args) {
    return new Promise((resolveExit, reject) => {
        const child = spawn(command, args, { cwd: projectRoot, stdio: "inherit" })
        child.once("error", reject)
        child.once("exit", (code, signal) => resolveExit(code ?? (signal ? 1 : 0)))
    })
}

const mode = runtimeMode(appBinary)
let viteProcess

try {
    if (mode === "dev" && !(await isPortOpen(1420))) {
        console.log(`Detected Tauri dev binary; starting Vite at ${viteUrl}.`)
        viteProcess = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev:vite"], {
            cwd: projectRoot,
            stdio: "inherit",
        })
        await waitForVite(viteProcess)
    }

    process.exitCode = await run(process.platform === "win32" ? "npx.cmd" : "npx", [
        "--no-install",
        "wdio",
        "run",
        "./test/wdio.conf.ts",
        "--tsConfigPath",
        "./tsconfig.wdio.json",
        ...process.argv.slice(2),
    ])
} finally {
    if (viteProcess && viteProcess.exitCode === null) viteProcess.kill("SIGTERM")
}
