import { stat } from "node:fs/promises"
import { join } from "node:path"
import { getAppDataDir } from "../util/paths"

describe("Tauri WebdriverIO Plugin", () => {
    it("should have plugin available", async () => {
        expect(typeof browser.tauri?.execute).toBe("function")

        const available = await browser.tauri.execute(() => {
            return typeof window.wdioTauri?.execute === "function"
        })

        expect(available).toBe(true)
    })

    it("creates the E2E Projects database and migration version file", async () => {
        const appDataDir = getAppDataDir()
        for (const name of ["projects4-e2e.db", "e2e_version.txt"]) {
            expect((await stat(join(appDataDir, name))).isFile()).toBe(true)
        }
    })
})
