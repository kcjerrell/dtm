import { exec, execFileSync, execSync } from "node:child_process"
import { realpathSync } from "node:fs"
import { resolve } from "node:path"

export async function shiftClick(el: ChainablePromiseElement) {
    await el.execute((elem) => {
        const event = new PointerEvent("click", {
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        })
        elem.dispatchEvent(event)
    })
}

export async function cmdClick(el: ChainablePromiseElement) {
    await el.execute((elem) => {
        const event = new PointerEvent("click", {
            metaKey: true,
            bubbles: true,
            cancelable: true,
        })
        elem.dispatchEvent(event)
    })
}

/** copies a file to the clipboard (macOS only) */
export function copyFileToClipboard(filePath: string) {
    execSync(`osascript -e 'set the clipboard to (POSIX file "${filePath}")'`)
}

/** copies a file path as plain text to clipboard (macOS only) */
export function copyFilePathTextToClipboard(filePath: string) {
    const escaped = filePath.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    execSync(`osascript -e 'set the clipboard to "${escaped}"'`)
}

/** copies files to the clipboard (macOS only) */
export function copyFilesToClipboard(files: string[]) {
    const applescript = `
	set the clipboard to {${files.map((f) => `POSIX file "${f}"`).join(", ")}}
	`

    execSync(`osascript -e '${applescript}'`)
}

/** returns POSIX file paths currently present on clipboard (if any) */
export function getClipboardFilePaths(): string[] {
    const output = execFileSync(
        "osascript",
        [
            "-e",
            "set c to the clipboard",
            "-e",
            "if class of c is alias then",
            "-e",
            "  return POSIX path of c",
            "-e",
            "end if",
            "-e",
            "if class of c is list then",
            "-e",
            "  set out to {}",
            "-e",
            "  repeat with itemRef in c",
            "-e",
            "    if class of itemRef is alias then",
            "-e",
            "      copy POSIX path of itemRef to end of out",
            "-e",
            "    else",
            "-e",
            "      try",
            "-e",
            "        copy POSIX path of (itemRef as alias) to end of out",
            "-e",
            "      end try",
            "-e",
            "    end if",
            "-e",
            "  end repeat",
            "-e",
            '  if (count of out) is 0 then return ""',
            "-e",
            "  set AppleScript's text item delimiters to (ASCII character 10)",
            "-e",
            "  return out as text",
            "-e",
            "end if",
            "-e",
            'return ""',
        ],
        { encoding: "utf8" },
    ).trim()

    if (!output) return []
    return output
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean)
}

/** returns true when clipboard advertises a file-like payload type */
export function clipboardHasFilePayload() {
    return getClipboardInfoTypes().some((typeText) => {
        return typeText.includes("furl") || typeText.includes("alis") || typeText.includes("file")
    })
}

export function getClipboardInfoTypes(): string[] {
    const output = execFileSync(
        "osascript",
        [
            "-e",
            "set cinfo to clipboard info",
            "-e",
            "set out to {}",
            "-e",
            "repeat with entryRef in cinfo",
            "-e",
            "  set typeText to (item 1 of entryRef) as text",
            "-e",
            "  copy typeText to end of out",
            "-e",
            "end repeat",
            "-e",
            'if (count of out) is 0 then return ""',
            "-e",
            "set AppleScript's text item delimiters to (ASCII character 10)",
            "-e",
            "return out as text",
        ],
        { encoding: "utf8" },
    ).trim()

    if (!output) return []
    return output
        .split("\n")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
}

function normalizePathForMatch(filePath: string) {
    const cleaned = filePath.trim().replace(/\/+$/, "")
    try {
        return realpathSync.native(cleaned)
    } catch {
        return resolve(cleaned)
    }
}

export function clipboardHasFile(filePath: string) {
    const expectedNorm = normalizePathForMatch(filePath)
    const expectedBase = expectedNorm.split("/").pop()?.toLowerCase()
    if (clipboardHasFilePayload() === false) return false

    const paths = getClipboardFilePaths()
    if (paths.length === 0) return true

    return paths.some((p) => {
        const actualNorm = normalizePathForMatch(p)
        if (actualNorm === expectedNorm) return true
        if (!expectedBase) return false
        return actualNorm.split("/").pop()?.toLowerCase() === expectedBase
    })
}

export function getClipboardText() {
    try {
        return execSync("osascript -e 'the clipboard as text'", { encoding: "utf8" }).trim()
    } catch {
        return ""
    }
}

/** verifies osascript can write/read clipboard in this runtime (macOS only) */
export function assertOsaScriptClipboardAvailable() {
    const token = `wdio-clipboard-check-${Date.now()}`
    const escapedToken = token.replace(/"/g, '\\"')

    try {
        execSync(`osascript -e 'set the clipboard to "${escapedToken}"'`)
        const result = execSync("osascript -e 'the clipboard as text'", {
            encoding: "utf8",
        }).trim()

        if (result !== token) {
            throw new Error(`Clipboard round-trip mismatch. Expected "${token}", got "${result}".`)
        }
    } catch (error) {
        throw new Error(
            `osascript clipboard check failed. Ensure tests run on an interactive macOS session with clipboard access. ${String(error)}`,
        )
    }
}

export function skipIfFailed() {
    let failed = false

    afterEach(function () {
        if (this.currentTest?.state === "failed") {
            failed = true
        }
    })
    beforeEach(function () {
        if (failed) {
            this.skip()
        }
    })
}

/**
 * Calls __E2E_TEST_OVERRIDE() for each key in the data object
 * Note: Must be JSON serializable
 */
export async function setTestOverride(overrideData: E2ETestOverrides) {
    await browser.execute((data: E2ETestOverrides) => {
        for (const key in data) {
            window.__E2E_TEST_OVERRIDE(key, data[key])
        }
    }, overrideData)
}

export async function clearClipboard() {
    return new Promise<void>((resolve, reject) => {
        exec("pbcopy < /dev/null", (err) => {
            if (err) reject(err)
            else resolve()
        })
    })
}
