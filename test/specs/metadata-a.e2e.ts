import os from "node:os"
import { join } from "node:path"
import fse from "fs-extra"
import App from "../pageobjects/App"
import Metadata from "../pageobjects/Metadata"
import { getPasteboardData, setPasteboardOverride } from "../util/clipdump"
import { clearClipboard, setTestOverride, skipIfFailed } from "../util/helpers"
import { getTestDataPath } from "../util/paths"
import { getFile, waitForFile } from "../util/testData"

const md = Metadata
const tempDir = getTestDataPath("temp", "md")
const ffmpegBinDir = join(os.homedir(), "Library", "Application Support", "com.kcjer.dtm", "bin")
const ffmpegTempDir = join(os.homedir(), "Library", "Application Support", "com.kcjer.dtm", "temp")
const ffmpegArchiveFixtureDir = getTestDataPath("ffmpeg")

// these tests depend on previous tests, and will skip if one fails
describe("Metadata", () => {
    skipIfFailed()

    before(async () => {
        await clearClipboard()
        await fse.ensureDir(tempDir)
        await fse.emptyDir(tempDir)
        await browser.execute(() => {
            window.__reset_metadata_store()
        })
    })

    it("loads image dropped from finder", async () => {
        // go to metadata tab
        await App.selectView("metadata")
        // clear images if there any
        if (await md.toolbar.clearUnpinned.isExisting()) {
            await md.toolbar.clearUnpinned.click()
        }

        // set pasteboard override
        const imagePath = getFile("astro.png")
        const data = getPasteboardData("drop", "finder", "image")?.({ path: imagePath })
        await setPasteboardOverride(data)

        // trigger a drop
        await md.triggerDrop()

        await md.dropHere.waitForDisplayed({ reverse: true })

        // make sure we're on the details tab
        await md.selectTab("details")

        // // verify image is loaded
        expect(await md.isImageLoaded()).toBe(true)
        expect(await md.getDataItemValue("Location")).toContain("astro.png")

        // // confirm config was load
        await md.selectTab("config")

        expect(await md.getDataItemValue("Prompt")).toContain("A lone astronaut")
        expect(await md.getDataItemValue("Model")).toContain("z_image_turbo")
    })

    it("loads from an image copied from finder", async () => {
        // go to metadata tab
        await App.selectView("metadata")

        // get clipboard data
        const imagePath = getFile("astro2.png")
        const data = getPasteboardData("paste", "finder", "image")?.({ path: imagePath })
        if (!data) throw new Error("No clipboard data found")

        // set pasteboard override
        await setPasteboardOverride(data)

        // paste file into metadata tab
        await md.toolbar.loadFromClipboard.click()

        await md.dropHere.waitForDisplayed({ reverse: true })

        // make sure we're on the details tab
        await md.selectTab("details")

        // // verify image is loaded
        expect(await md.isImageLoaded()).toBe(true)
        expect(await md.getDataItemValue("Location")).toContain("astro2.png")

        // // confirm config was load
        await md.selectTab("config")

        await expect(await md.getDataItemValue("Prompt")).toContain("Bold graphic novel art")
        await expect(await md.getDataItemValue("Model")).toContain("z_image_turbo")
    })

    // at this point there are two images loaded in the metadata viewer
    it("has working toolbar commands", async () => {
        // confirm two items are loaded
        expect(await md.history.getItemCount()).toEqual(2)

        browser.waitUntil(
            async () => {
                return (await md.history.getItemCount()) === 2
            },
            { timeout: 5000, interval: 100 },
        )

        // select the first item
        await md.history.clickItem(1)
        expect(await md.history.isItemSelected(1)).toBe(true)

        // verify image is loaded
        expect(await md.isImageLoaded()).toBe(true)
        await md.selectTab("details")
        expect(await md.getDataItemValue("Location")).toContain("astro.png")

        // select the second item
        await md.history.clickItem(2)
        expect(await md.history.isItemSelected(2)).toBe(true)

        // verify image is loaded
        expect(await md.isImageLoaded()).toBe(true)
        await md.selectTab("details")
        expect(await md.getDataItemValue("Location")).toContain("astro2.png")

        // pin the image
        await md.toolbar.pinImage.click()
        expect(await md.toolbar.pinImage.isExisting()).toBe(false)
        expect(await md.toolbar.unpinImage.isExisting()).toBe(true)

        // save the image
        const astro2Path = join(tempDir, "astro2_copy.png")
        await setTestOverride({ saveDialogPath: astro2Path })
        await md.toolbar.saveImage.click()
        await waitForFile(astro2Path)

        // go back to astro
        // pinned images are listed first, so, astro2 is at index 2 now
        await md.history.clickItem(2)
        expect(await md.history.isItemSelected(2)).toBe(true)
        expect(await md.isImageLoaded()).toBe(true)
        expect(await md.getDataItemValue("Location")).toContain("astro.png")

        // copy the image
        await md.toolbar.copyImage.click()

        await browser.pause(3000)

        // paste the image
        await md.toolbar.loadFromClipboard.click()

        browser.waitUntil(
            async () => {
                return (await md.history.getItemCount()) === 3
            },
            { timeout: 5000, interval: 100 },
        )

        // the config should be selected automatically
        await expect(md.configTab).toHaveAttribute("aria-selected", "true")
        expect(await md.getDataItemValue("Sampler")).toContain("UniPC Trailing")

        // back on the details tab, source should say Image from clipboard
        await md.selectTab("details")
        expect(await md.getDataItemValue("Source")).toContain("Image from clipboard")
        expect(await md.getDataItemValue("Location", { noThrow: true, timeout: 2000 })).toBeNull()
    })

    it("loads video metadata after ffmpeg install", async () => {
        const videoPath = getTestDataPath("temp", "vid-export2.mp4")
        if (!(await fse.pathExists(videoPath))) {
            throw new Error(`Video file not found: ${videoPath}`)
        }

        await fse.remove(ffmpegBinDir)
        await fse.ensureDir(ffmpegTempDir)
        for (const archiveName of ["ffmpeg.7z", "ffprobe.7z"]) {
            const src = join(ffmpegArchiveFixtureDir, archiveName)
            const dest = join(ffmpegTempDir, archiveName)
            if (await fse.pathExists(src)) {
                await fse.copy(src, dest, { overwrite: true })
            }
        }

        await App.selectView("metadata")
        // clear images if there any
        if (await md.toolbar.clearUnpinned.isExisting()) {
            await md.toolbar.clearUnpinned.click()
        }

        const pasteboardData =
            getPasteboardData("paste", "finder", "image")?.({ path: videoPath }) ?? {}
        if (!Object.keys(pasteboardData).length) throw new Error("No clipboard data found")
        await setPasteboardOverride(pasteboardData)

        // paste video into metadata view
        await md.toolbar.loadFromClipboard.click()
        await md.dropHere.waitForDisplayed({ reverse: true })

        // assert the current item is a video
        await expect($("#metadata video")).toBeDisplayed()

        // verify ffmpeg component appears in info panel
        const ffmpegSection = $("[data-testid='ffmpeg-section']")
        await expect(ffmpegSection).toBeDisplayed()

        // click install and wait for ffmpeg panel to clear
        await ffmpegSection.$("button=Install").click()

        await md.getDataItemValue("filename", { timeout: 60000 })

        expect(await md.getDataItemValue("nb_streams")).toContain("2")
        expect(parseFloat((await md.getDataItemValue("duration")) ?? "0")).toBeGreaterThan(0)
        expect(await md.getDataItemValue("tags")).toContain("comment")
        expect(await md.getDataItemValue("tags")).toContain("model")
        expect(await md.getDataItemValue("tags")).toContain("v2")
    })
})
