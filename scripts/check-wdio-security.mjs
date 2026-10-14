import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const read = (path) => readFileSync(resolve(root, path), "utf8")
const cargo = read("src-tauri/Cargo.toml")
const lib = read("src-tauri/src/lib.rs")
const capabilities = JSON.parse(read("src-tauri/capabilities/default.json"))
const packageJson = JSON.parse(read("package.json"))

function requireMatch(value, pattern, message) {
    if (!pattern.test(value)) throw new Error(message)
}

requireMatch(
    cargo,
    /e2e\s*=\s*\["dep:tauri-plugin-wdio", "dep:tauri-plugin-wdio-webdriver"\]/,
    "the e2e feature must enable both WDIO dependencies",
)
for (const dependency of ["tauri-plugin-wdio", "tauri-plugin-wdio-webdriver"]) {
    requireMatch(
        cargo,
        new RegExp(`^${dependency}\\s*=\\s*\\{[^\\n]*optional\\s*=\\s*true`, "m"),
        `${dependency} must remain optional`,
    )
}

const gatedRegistrations = lib.match(
    /#\[cfg\(feature = "e2e"\)\][\s\S]*?\.plugin\(tauri_plugin_wdio::init\(\)\)[\s\S]*?\.plugin\(tauri_plugin_wdio_webdriver::init\(\)\);/,
)
if (!gatedRegistrations) throw new Error("both WDIO plugin registrations must be e2e-gated")
requireMatch(
    lib,
    /#\[cfg\(feature = "e2e"\)\][\s\S]*?CapabilityBuilder::new\("e2e-wdio"\)[\s\S]*?\.permission\("wdio:default"\)/,
    "the WDIO frontend permission must be granted only by the e2e build",
)

if (capabilities.permissions.some((permission) => String(permission.identifier ?? permission).startsWith("wdio"))) {
    throw new Error("the production capability must not grant WDIO permissions")
}
if (!packageJson.scripts["build:e2e"]?.includes("--features e2e")) {
    throw new Error("build:e2e must explicitly enable the e2e Cargo feature")
}

console.log("WDIO production exclusion and explicit E2E enablement checks passed.")
