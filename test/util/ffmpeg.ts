import { execFileSync } from "node:child_process"
import path from "node:path"
import fse from "fs-extra"
import App from "../pageobjects/App"
import DTProjects from "../pageobjects/DTProjects"
import { getAppDataDir, getTestDataPath } from "./paths"

const appDataDir = getAppDataDir()
export const ffmpegBinDir = path.join(appDataDir, "bin")
export const ffmpegTempDir = path.join(appDataDir, "temp")
export const ffmpegArchiveFixtureDir = getTestDataPath("ffmpeg")

function systemToolPath(name: "ffmpeg" | "ffprobe"): string {
    return process.env[`DTM_${name.toUpperCase()}_PATH`] || name
}

export const ffmpegPath =
    process.platform === "linux" ? systemToolPath("ffmpeg") : path.join(ffmpegBinDir, "ffmpeg")
export const ffprobePath =
    process.platform === "linux" ? systemToolPath("ffprobe") : path.join(ffmpegBinDir, "ffprobe")

/**
 * Copies the bundled ffmpeg/ffprobe .7z fixtures into the app's temp dir so the
 * install flow extracts them from disk instead of downloading them.
 */
export async function stageFfmpegArchives() {
    if (process.platform === "linux") return
    await fse.ensureDir(ffmpegTempDir)
    for (const archiveName of ["ffmpeg.7z", "ffprobe.7z"]) {
        const src = path.join(ffmpegArchiveFixtureDir, archiveName)
        const dest = path.join(ffmpegTempDir, archiveName)
        if (await fse.pathExists(src)) {
            await fse.copy(src, dest, { overwrite: true })
        }
    }
}

/** Removes any installed ffmpeg/ffprobe binaries so the install flow runs fresh. */
export async function removeFfmpegBinaries() {
    if (process.platform === "linux") return
    await fse.remove(ffmpegBinDir)
}

/** True when both ffmpeg and ffprobe binaries exist in the app's bin dir. */
export async function ffmpegInstalled() {
    try {
        await checkFFmpeg()
        return true
    } catch {
        return false
    }
}

export async function checkFFmpeg() {
    if (process.platform === "darwin") {
        const ffmpegExists = await fse.pathExists(ffmpegPath)
        const ffprobeExists = await fse.pathExists(ffprobePath)
        let msg = ""
        if (!ffmpegExists) msg += `ffmpeg not found at ${ffmpegPath}\n`
        if (!ffprobeExists) msg += `ffprobe not found at ${ffprobePath}\n`
        if (msg) throw new Error(msg)
    }
    let a = performance.now()
    try {
        execFileSync(ffmpegPath, ["-version"], { stdio: "ignore", timeout: 15000 })
    } catch (err) {
        const b = performance.now()
        throw new Error(`ffmpeg check failed after ${Math.round(b - a)}ms: ${err}`)
    }
    a = performance.now()
    try {
        execFileSync(ffprobePath, ["-version"], { stdio: "ignore", timeout: 15000 })
    } catch (err) {
        const b = performance.now()
        throw new Error(
            `ffmpeg check completed, but ffprobe check failed after ${Math.round(b - a)}ms: ${err}`,
        )
    }
}

async function waitForImageGridReady() {
    await browser.waitUntil(
        async () => (await $('[data-testid="image-grid"]').getAttribute("aria-busy")) !== "true",
        {
            timeout: 60000,
            interval: 300,
            timeoutMsg: "Image grid did not finish loading",
        },
    )
}

/**
 * Ensures ffmpeg/ffprobe are installed before a test that depends on them.
 *
 * If both binaries already exist this is a fast no-op. Otherwise it stages the
 * .7z fixtures and drives the video export install flow once (open a video,
 * open the Save video dialog, click Install) and waits for the binaries to
 * appear on disk.
 */
export async function ensureFfmpeg() {
    if (await ffmpegInstalled()) return

    await stageFfmpegArchives()

    if (process.platform === "linux") {
        throw new Error(
            "Working system ffmpeg and ffprobe are required; install the Ubuntu ffmpeg package",
        )
    }

    // go to projects view
    await browser.refresh()
    await browser.pause(3000)
    await App.selectView("projects")

    // make sure we're on the projects tab
    await $("aria/Projects tab").click()

    // filter by video using toolbar button (idempotent)
    const showVideosToggle = DTProjects.imageToolbar.showVideos
    const showVideosPressed = await showVideosToggle.getAttribute("aria-pressed")
    if (showVideosPressed !== "true") {
        await showVideosToggle.click()
    }
    await waitForImageGridReady()

    const items = await $$('[data-testid="image-item"]').getElements()
    expect(items.length).toBeGreaterThan(0)

    // open the first video
    await items[0].click()
    await expect($("#details-overlay")).toBeDisplayed()

    // open the Save video dialog and run the install flow
    await $("aria/Save video").click()
    await expect($("body")).toHaveText(expect.stringContaining("Export Video"))

    await expect($("[data-testid='ffmpeg-section']")).toBeDisplayed()
    const exportButton = $("aria/Export video")
    await expect(exportButton).toBeDisabled()
    await $("button=Install").click()

    await $("[data-testid='ffmpeg-section']").waitForDisplayed({
        timeout: 25000,
        reverse: true,
    })
    await exportButton.waitForEnabled({ timeout: 30000 })

    if (!(await ffmpegInstalled())) {
        throw new Error(
            `ffmpeg install flow completed but binaries were not found in ${ffmpegBinDir}`,
        )
    }
}
