import { execFileSync } from "node:child_process"
import path from "node:path"
import fse from "fs-extra"
import App from "../pageobjects/App"
import DTProjects from "../pageobjects/DTProjects"
import { getAppDataDir, getTestDataPath } from "./paths"

export const ffmpegBinDir = path.join(getAppDataDir(), "bin")
export const ffmpegTempDir = path.join(getAppDataDir(), "temp")
export const ffmpegArchiveFixtureDir = getTestDataPath("ffmpeg")

export const ffmpegPath =
    process.platform === "linux"
        ? process.env.DTM_FFMPEG_PATH || "ffmpeg"
        : path.join(ffmpegBinDir, "ffmpeg")
export const ffprobePath =
    process.platform === "linux"
        ? process.env.DTM_FFPROBE_PATH || "ffprobe"
        : path.join(ffmpegBinDir, "ffprobe")

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
    if (process.platform === "linux") {
        try {
            execFileSync(ffmpegPath, ["-version"], { stdio: "ignore", timeout: 5000 })
            execFileSync(ffprobePath, ["-version"], { stdio: "ignore", timeout: 5000 })
            return true
        } catch {
            return false
        }
    }
    return (await fse.pathExists(ffmpegPath)) && (await fse.pathExists(ffprobePath))
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
        throw new Error("ffmpeg install flow completed but binaries were not found on disk")
    }
}
