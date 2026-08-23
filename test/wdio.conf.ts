import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Options } from "@wdio/types"
import { config as dotenvConfig } from "dotenv"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenvConfig({ path: resolve(__dirname, ".env"), override: false })

const SCREENSHOT_DIR = resolve(__dirname, "artifacts", "screenshots")

function safeFileName(value: string) {
    return value.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 120)
}

export const config: Options.Testrunner & Record<string, unknown> = {
    runner: "local",
    maxInstances: 1,
    specs: [
        "./specs/tauri-wdio.e2e.ts",
        "./specs/projects-a.e2e.ts",
        "./specs/model-selector-popup.e2e.ts",
        "./specs/projects.e2e.ts",
        "./specs/video-export.e2e.ts",
        "./specs/metadata-a.e2e.ts",
        "./specs/project-export.e2e.ts",
    ],
    exclude: [],

    reporters: ["spec"],

    services: [
        [
            "@wdio/tauri-service",
            {
                appBinaryPath: "./src-tauri/target/debug/dtm",
            },
        ],
    ],

    capabilities: [
        {
            browserName: "tauri",
            "tauri:options": {
                application: "./src-tauri/target/debug/dtm",
            },
        },
    ],

    // Logging
    logLevel: "warn",
    bail: 0,
    baseUrl: "http://localhost:4444",
    waitforTimeout: 10000,
    connectionRetryTimeout: 90000,
    connectionRetryCount: 3,

    framework: "mocha",
    mochaOpts: {
        ui: "bdd",
        timeout: 60000,
    },

    // Hooks
    onPrepare: async () => {
        mkdirSync(SCREENSHOT_DIR, { recursive: true })
    },

    // onComplete: () => {
    //     // Global teardown after all workers are finished
    // },

    // beforeSession: async (config, capabilities, specs) => {
    //     // isAppRunning = false
    //     // if (checkForAppInstance("DTM") || checkForAppInstance("dtm")) {
    //     //     // use existing app
    //     //     isAppRunning = true
    //     //     console.log(`App is already running. Connecting to existing session...`)
    //     //     await waitForServer(WEBDRIVER_PORT, 10000)
    //     //     return
    //     // }
    //     // if (useDev) {
    //     //     console.log("Starting app in dev mode...")
    //     //     await startDevServer(WEBDRIVER_PORT)
    //     //     return
    //     // }
    //     // console.log("Starting debug build...")
    //     // await startApp(WEBDRIVER_PORT)
    // },

    // afterSession: async () => {
    //     // if (isAppRunning) return
    //     // console.log("Stopping Tauri application...")
    //     // stopApp()
    // },

    afterTest: async (test, context, result) => {
        if (result.passed) return
        try {
            const diagnostics = await browser.execute(() => {
                const appRoot = document.querySelector("[data-current-view]")
                const viewContainers = Array.from(
                    document.querySelectorAll<HTMLElement>("[data-view-container]"),
                ).map((el) => {
                    const rect = el.getBoundingClientRect()
                    const style = window.getComputedStyle(el)
                    return {
                        view: el.dataset.viewContainer,
                        active: el.dataset.activeView,
                        mode: el.dataset.activityMode,
                        rect: {
                            x: rect.x,
                            y: rect.y,
                            width: rect.width,
                            height: rect.height,
                        },
                        display: style.display,
                        opacity: style.opacity,
                        visibility: style.visibility,
                    }
                })
                return {
                    currentView: appRoot?.getAttribute("data-current-view"),
                    mountedViews: appRoot?.getAttribute("data-mounted-views"),
                    activeButton: document
                        .querySelector("[aria-current='page']")
                        ?.textContent?.trim(),
                    metadataExists: !!document.getElementById("metadata"),
                    projectsExists: !!document.getElementById("dt-projects"),
                    bodyText: document.body.innerText.slice(0, 1000),
                    viewContainers,
                }
            })
            console.log(`Failure diagnostics: ${JSON.stringify(diagnostics, null, 2)}`)
            mkdirSync(SCREENSHOT_DIR, { recursive: true })
            const stamp = new Date().toISOString().replace(/[:.]/g, "-")
            const suite = safeFileName(test.parent || "suite")
            const title = safeFileName(test.title || "test")
            const filename = `${stamp}__${suite}__${title}.png`
            const targetPath = resolve(SCREENSHOT_DIR, filename)
            await browser.saveScreenshot(targetPath)
            console.log(`Saved failure screenshot: ${targetPath}`)
        } catch (err) {
            console.error("Unable to save failure screenshot", err)
        }
    },
}
