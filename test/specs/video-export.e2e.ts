import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import fse from "fs-extra"
import App from "../pageobjects/App"
import DTProjects from "../pageobjects/DTProjects"
import { setTestOverride } from "../util/helpers"
import { getTestDataPath } from "../util/paths"

/*
 these tests will require the default project setup
 specifically:
    folder-b (mounted as Volumes/folder-b)
    test-project-e2
*/

const ffmpegBinDir = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "com.kcjer.dtm",
    "bin",
)
const ffmpegTempDir = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "com.kcjer.dtm",
    "temp",
)
const ffmpegArchiveFixtureDir = getTestDataPath("ffmpeg")

type E2EWindow = Window & {
    __E2E_FILE_PATH__?: string
}

function parseFps(rate: string): number {
    const [num, denom] = rate.split("/").map((v) => Number(v))
    if (!num || !denom) return 0
    return num / denom
}

function findFfprobePath(): string {
    const entries = fs.existsSync(ffmpegBinDir) ? fs.readdirSync(ffmpegBinDir) : []
    const fromAppBin = entries.find((entry) => entry.startsWith("ffprobe"))
    if (fromAppBin) {
        return path.join(ffmpegBinDir, fromAppBin)
    }

    const fallback = ["/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe"].find((p) =>
        fs.existsSync(p),
    )
    if (fallback) return fallback
    return "ffprobe"
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

async function clickFilterPopupItem(label: string) {
    const option = await $(
        `//div[@data-filter-popup]//*[@role="option" and (normalize-space()="${label}" or .//*[normalize-space()="${label}"])]`,
    )
    await option.waitForDisplayed({ timeout: 10000 })
    await option.click()
}

describe("Video Export", () => {
    it("can export a video", async () => {
        const videoOutputPath = getTestDataPath("temp", "vid-export.mp4")
        await fse.remove(videoOutputPath)

        // ensure ffmpeg has been deleted by removing the bin folder in the appdatadir
        await fse.remove(ffmpegBinDir)
        await fse.ensureDir(ffmpegTempDir)
        for (const archiveName of ["ffmpeg.7z", "ffprobe.7z"]) {
            const src = path.join(ffmpegArchiveFixtureDir, archiveName)
            const dest = path.join(ffmpegTempDir, archiveName)
            if (await fse.pathExists(src)) {
                await fse.copy(src, dest, { overwrite: true })
            }
        }

        // go to projects view
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

        const initialItems = await $$('[data-testid="image-item"]').getElements()
        expect(initialItems.length).toBeGreaterThan(0)

        // assert each item in grid has a video icon and frame count
        for (const item of initialItems.slice(0, 5)) {
            await expect(item.$('[data-testid="video-frame-indicator"]')).toExist()
        }

        // we need to select a video that does NOT have audio
        // go to the search tab
        await $("aria/Search tab").click()
        await expect($("aria/Search tab")).toHaveAttribute("aria-selected", "true")

        // click add filter
        await $("aria/Add search filter").click()

        // select Model in the filter type
        await $("aria/Add search filter").click()
        const filterForm = DTProjects.searchPanel.getFilter(0)
        await filterForm.target.click()
        ;(await filterForm.getTargetOption("model")).click()

        // click select a model
        await $('[aria-label="models filter value selector"]').click()

        // select Wan 2.1 14b in the versions list
        const versionItem = $('[aria-label*="Model version Wan 2.1 14b"]')
        await versionItem.waitForDisplayed({ timeout: 15000 })
        await versionItem.click()

        // assert models list has been filtered and model version item is listed
        const modelItem = $(
            '[aria-label*="Model item Wan 2.2 High Noise Expert T2V A14B (6-bit, SVDQuant)"]',
        )
        await modelItem.waitForDisplayed({ timeout: 15000 })
        await expect(modelItem).toBeDisplayed()

        // select Wan2.1 T2V 14B
        await modelItem.click()

        // assert model name appears in the search filter
        await expect($('[aria-label="models filter value selector"]')).toHaveText(
            expect.stringContaining("Wan 2.2 High Noise"),
        )

        // click search
        await $("aria/Apply search").click()
        await waitForImageGridReady()

        // assert images have been reduced
        const filteredItems = await $$('[data-testid="image-item"]').getElements()
        expect(filteredItems.length).toBeGreaterThan(0)
        expect(filteredItems.length).toBeLessThan(await initialItems.length)

        // assert statusbar says "1 filter"
        await expect(DTProjects.imageToolbar.filters).toHaveText(
            expect.stringContaining("1 filter"),
        )

        // click the first image
        await filteredItems[0].click()
        await expect($("#details-overlay")).toBeDisplayed()

        // assert some details
        await expect($("body")).toHaveText(expect.stringContaining("wan_v2.1_14b"))
        await expect($("body")).toHaveText(
            expect.stringContaining("Wan 2.2 High Noise Expert T2V A14B"),
        )
        await expect($("body")).toHaveText(expect.stringContaining("Num Frames"))
        await expect($("body")).toHaveText(expect.stringContaining("17"))

        // assert presence of play button, video image, and seekbar
        await expect($("aria/Play video")).toBeDisplayed()
        await expect($("aria/Video preview image")).toBeDisplayed()
        await expect($("aria/Video seekbar")).toBeDisplayed()

        // assert absence of mute button
        await expect($('[aria-label="Mute video"], [aria-label="Unmute video"]')).not.toExist()

        // assert presence of toolbar buttons
        await expect($("aria/Save video")).toBeDisplayed()
        await expect($("aria/Save all frames")).toBeDisplayed()
        await expect($("aria/Copy selected frame")).toBeDisplayed()
        await expect($("aria/Save selected frame")).toBeDisplayed()
        await expect($("aria/Send selected frame to Metadata")).toBeDisplayed()

        // click play, assert play button changes to pause button
        await $("aria/Play video").click()
        await expect($("aria/Pause video")).toBeDisplayed()

        // click pause, assert pause button changes to play button
        await $("aria/Pause video").click()
        await expect($("aria/Play video")).toBeDisplayed()

        // click Save video
        await $("aria/Save video").click()
        await expect($("body")).toHaveText(expect.stringContaining("Export Video"))

        // assert video size and fps inputs have expected values (512x512, 16fps)
        await expect($("aria/Video export width")).toHaveValue("512")
        await expect($("aria/Video export height")).toHaveValue("512")
        await expect($("aria/Video export fps")).toHaveValue("16")

        // assert Duration: 1.3s / Source size text
        await expect($("body")).toHaveText(expect.stringContaining("Duration"))
        await expect($("body")).toHaveText(expect.stringContaining("1.1s"))
        await expect($("body")).toHaveText(expect.stringContaining("Source size: 512 x 512"))

        // assert ffmpeg install flow
        await expect($("[data-testid='ffmpeg-section']")).toBeDisplayed()
        await expect($("body")).toHaveText(
            expect.stringContaining("FFMPEG must be downloaded before video can be exported"),
        )
        const exportButton = $("aria/Export video")
        await expect(exportButton).toBeDisabled()
        await $("button=Install").click()

        await $("[data-testid='ffmpeg-section']").waitForDisplayed({
            timeout: 25000,
            reverse: true,
        })

        await exportButton.waitForEnabled({ timeout: 15000 })

        // select Preview frame source
        await $("aria/Preview frame source").click()

        await setTestOverride({ saveDialogPath: videoOutputPath })

        // click export
        await exportButton.click()

        // assert Progress section appears and completes
        await expect($("body")).toHaveText(expect.stringContaining("Progress"))

        await $('[aria-label*="Exporting frames progress"][aria-valuenow="100"]').waitForDisplayed({
            timeout: 20000,
        })
        await $('[aria-label*="Encoding video progress"][aria-valuenow="100"]').waitForDisplayed({
            timeout: 20000,
        })

        // assert file exists
        expect(await fse.pathExists(videoOutputPath)).toBe(true)

        // use ffprobe to confirm metadata/video properties
        const ffprobePath = findFfprobePath()
        const probeRaw = execFileSync(
            ffprobePath,
            [
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                videoOutputPath,
            ],
            { encoding: "utf8" },
        )
        const probe = JSON.parse(probeRaw) as {
            format?: {
                duration?: string
                bit_rate?: string
                tags?: Record<string, string>
            }
            streams?: Array<{
                codec_type?: string
                codec_name?: string
                pix_fmt?: string
                width?: number
                height?: number
                r_frame_rate?: string
                tags?: Record<string, string>
            }>
        }

        const videoStream = probe.streams?.find((s) => s.codec_type === "video")
        expect(videoStream).toBeDefined()
        expect(videoStream?.codec_name).toBe("h264")
        expect(videoStream?.width).toBe(512)
        expect(videoStream?.height).toBe(512)
        expect(parseFps(videoStream?.r_frame_rate ?? "0/1")).toBe(16)

        const duration = Number(probe.format?.duration ?? "0")
        expect(duration).toBeGreaterThan(1)
        expect(duration).toBeLessThan(1.2)

        const bitRate = Number(probe.format?.bit_rate ?? "0")
        expect(bitRate).toBeGreaterThan(900_000)

        const comment = probe.format?.tags?.comment ?? videoStream?.tags?.comment ?? ""
        expect(comment).toContain('"c":"A moonrise on an alien planet')
        expect(comment).toContain('"model":"wan_v2.2_a14b_hne_t2v_q6p_svd.ckpt"')
    })
})
